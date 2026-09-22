/** @fileoverview 用可控慢请求验证工作站即时反馈、旧读隔离、失败恢复与创建后记录收尾。 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useCloudWorkstation } from '@/features/workspace/use-cloud-workstation';
import { createCloudTask } from '@/features/workspace/create-cloud-task';
import { getPendingCloudWrites } from '@/lib/cloud-write-guard';
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

/** 仓储保留真实成员变化，清空写入挂起以便模拟 Realtime 和连续点击。 */
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
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useCloudWorkstation('owner', repository, onError), {
    wrapper,
  });
  return { client, key, pending, repository, onError, hook };
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
