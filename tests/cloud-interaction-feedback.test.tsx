/** @fileoverview 用可控慢请求验证工作站即时反馈、失败恢复、创建后记录收尾与跨操作错误隔离。 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useCloudWorkstation } from '@/features/workspace/use-cloud-workstation';
import { createCloudTask } from '@/features/workspace/create-cloud-task';
import { getPendingCloudWrites } from '@/lib/cloud-write-guard';
import { createMutationFeedback } from '@/lib/mutation-feedback';
import type { Task } from '@/types/domain';

/** 主动推进异步边界，避免靠等待时间猜测请求是否结束。 */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(cleanup);

/** 仓储保留真实成员变化，挂起清空写入并接入共享反馈版本，以便验证连续点击和外部新错误。 */
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } },
  });
  const key = ['workspace', 'owner', 'workstation'];
  let server = ['a', 'b', 'c'];
  client.setQueryData(key, server);
  const pending = deferred();
  const repository = {
    listWorkstationTaskIds: vi.fn(async () => [...server]),
    applyWorkstationCommand: vi.fn(
      async (command: import('@/lib/workstation-command').WorkstationCommand) => {
        if (command.type === 'clear') {
          await pending.promise;
          server = server.filter((id) => !command.ids.includes(id));
        }
        if (command.type === 'add') server.push(command.id);
        return [...server];
      },
    ),
  };
  const onError = vi.fn();
  const feedback = createMutationFeedback(onError);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => useCloudWorkstation('owner', repository, onError, feedback),
    { wrapper },
  );
  return { client, key, pending, repository, onError, feedback, hook };
}

it('clears immediately, ignores stale reads and preserves a subsequent add until both writes finish', async () => {
  const c = setup();
  act(() => c.hook.result.current.updateWorkstationTaskIds(() => []));
  expect(c.hook.result.current.workstationTaskIds).toEqual([]);
  await waitFor(() =>
    expect(c.repository.applyWorkstationCommand).toHaveBeenCalledWith({
      type: 'clear',
      ids: ['a', 'b', 'c'],
    }),
  );
  act(() => c.client.setQueryData(c.key, ['a', 'b', 'c']));
  expect(c.hook.result.current.workstationTaskIds).toEqual([]);
  act(() => c.hook.result.current.updateWorkstationTaskIds((ids) => [...ids, 'd']));
  expect(c.hook.result.current.workstationTaskIds).toEqual(['d']);
  await act(async () => c.pending.resolve());
  await waitFor(() => expect(getPendingCloudWrites()).toBe(0));
  expect(c.hook.result.current.workstationTaskIds).toEqual(['d']);
  expect(c.repository.applyWorkstationCommand).toHaveBeenCalledTimes(2);
  expect(c.repository.applyWorkstationCommand).toHaveBeenCalledWith({
    type: 'add',
    id: 'd',
  });
});

it('restores server membership on failure and permits retry', async () => {
  const c = setup();
  act(() => c.hook.result.current.updateWorkstationTaskIds([]));
  await waitFor(() => expect(c.repository.applyWorkstationCommand).toHaveBeenCalled());
  await act(async () => c.pending.reject(new Error('network')));
  await waitFor(() => expect(getPendingCloudWrites()).toBe(0));
  expect(c.hook.result.current.workstationTaskIds).toEqual(['a', 'b', 'c']);
  expect(c.onError).toHaveBeenCalledWith(expect.stringContaining('保存失败'));
  c.repository.applyWorkstationCommand.mockResolvedValueOnce([]);
  act(() => c.hook.result.current.updateWorkstationTaskIds([]));
  await waitFor(() => expect(getPendingCloudWrites()).toBe(0));
  expect(c.hook.result.current.workstationTaskIds).toEqual([]);
});

it('an older workstation success preserves a newer external error until a fresh confirmed command', async () => {
  const c = setup();
  c.feedback.report('之前的保存失败');
  act(() => c.hook.result.current.updateWorkstationTaskIds([]));
  await waitFor(() => expect(c.repository.applyWorkstationCommand).toHaveBeenCalled());
  c.feedback.report('另一条任务保存失败');
  const callsAtFailure = c.onError.mock.calls.length;

  await act(async () => c.pending.resolve());
  await waitFor(() => expect(getPendingCloudWrites()).toBe(0));
  expect(c.hook.result.current.workstationTaskIds).toEqual([]);
  expect(c.onError).toHaveBeenLastCalledWith('另一条任务保存失败');
  expect(c.onError).toHaveBeenCalledTimes(callsAtFailure);

  c.repository.applyWorkstationCommand.mockResolvedValueOnce(['fresh']);
  act(() => c.hook.result.current.runWorkstationCommand({ type: 'add', id: 'fresh' }));
  await waitFor(() => expect(getPendingCloudWrites()).toBe(0));
  expect(c.hook.result.current.workstationTaskIds).toEqual(['fresh']);
  expect(c.onError).toHaveBeenLastCalledWith(undefined);
});

it('returns a saved task before history finishes and never labels a history failure as creation failure', async () => {
  const client = new QueryClient();
  const history = deferred();
  const onError = vi.fn();
  const task: Task = {
    id: 'task',
    projectId: 'p',
    title: '保存一次',
    status: 'active',
    importance: 'normal',
    completed: false,
    createdAt: '2026-09-11',
  };
  const repository = {
    saveProject: vi.fn(),
    createTask: vi.fn(async () => task),
    appendHistory: vi.fn(() => history.promise),
  };
  client.setQueryData(['workspace', 'owner', 'tasks'], [task]); // Realtime 已先送达同一行。
  const saved = await createCloudTask(
    task,
    [
      {
        id: 'p',
        name: '项目',
        color: '#fff',
        status: 'active',
        createdAt: '',
        updatedAt: 'now',
      },
    ],
    repository,
    client,
    'owner',
    onError,
  );
  expect(saved).toEqual(task);
  expect(client.getQueryData(['workspace', 'owner', 'tasks'])).toEqual([task]);
  expect(getPendingCloudWrites()).toBeGreaterThan(0);
  history.reject(new Error('history unavailable'));
  await waitFor(() => expect(getPendingCloudWrites()).toBe(0));
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('任务已创建'));
  expect(repository.createTask).toHaveBeenCalledTimes(1);
});

it('another creation confirmation cannot clear a newer postcommit history warning', async () => {
  const client = new QueryClient();
  const firstWrite = deferred();
  const secondWrite = deferred();
  const firstHistory = deferred();
  const secondHistory = deferred();
  const onError = vi.fn();
  const feedback = createMutationFeedback(onError);
  const firstTask: Task = {
    id: 'first',
    projectId: 'p',
    title: '第一个任务',
    status: 'active',
    importance: 'normal',
    completed: false,
    createdAt: '2026-10-10',
  };
  const secondTask = { ...firstTask, id: 'second', title: '第二个任务' };
  const projects = [
    {
      id: 'p',
      name: '项目',
      color: '#fff',
      status: 'active' as const,
      createdAt: '',
      updatedAt: 'confirmed',
    },
  ];
  const repository = {
    saveProject: vi.fn(),
    /** 创建独立挂起，允许第一条的记录警告先于第二条主体确认到达。 */
    createTask: vi.fn(async (task: Task) => {
      await (task.id === 'first' ? firstWrite : secondWrite).promise;
      return task;
    }),
    /** 两条主体均已创建后仍独立持有写入保护；记录失败不能变成主体创建失败。 */
    appendHistory: vi.fn(
      (_event: unknown, task?: Task) =>
        (task?.id === 'first' ? firstHistory : secondHistory).promise,
    ),
  };
  const first = createCloudTask(
    firstTask,
    projects,
    repository,
    client,
    'owner',
    onError,
    feedback,
  );
  const second = createCloudTask(
    secondTask,
    projects,
    repository,
    client,
    'owner',
    onError,
    feedback,
  );

  try {
    firstWrite.resolve();
    expect(await first).toEqual(firstTask);
    await waitFor(() => expect(repository.appendHistory).toHaveBeenCalledTimes(1));
    firstHistory.reject(new Error('first history unavailable'));
    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith(
        '任务已创建，但记录同步失败，请刷新后检查。',
      ),
    );
    const callsAtWarning = onError.mock.calls.length;

    secondWrite.resolve();
    expect(await second).toEqual(secondTask);
    expect(repository.createTask).toHaveBeenCalledTimes(2);
    expect(repository.appendHistory).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(['workspace', 'owner', 'tasks'])).toEqual([
      firstTask,
      secondTask,
    ]);
    expect(onError).toHaveBeenCalledTimes(callsAtWarning);
    expect(onError).toHaveBeenLastCalledWith(
      '任务已创建，但记录同步失败，请刷新后检查。',
    );

    secondHistory.resolve();
    await waitFor(() => expect(getPendingCloudWrites()).toBe(0));
    expect(onError).toHaveBeenCalledTimes(callsAtWarning);
  } finally {
    firstWrite.resolve();
    secondWrite.resolve();
    firstHistory.resolve();
    secondHistory.resolve();
    await Promise.allSettled([first, second]);
    await waitFor(() => expect(getPendingCloudWrites()).toBe(0));
    client.clear();
  }
});
