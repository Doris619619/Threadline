/** @fileoverview 用延迟云端响应验证即时勾选、Realtime 旧读、前置拒绝、连续失败重试与会话反馈隔离。 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskLine } from '@/features/tasks/components/task-line';
import { useCloudTaskUpdates } from '@/features/workspace/use-cloud-task-updates';
import { createMutationFeedback } from '@/lib/mutation-feedback';
import * as cloudWriteGuard from '@/lib/cloud-write-guard';
import type { Task, TaskTimeEntry } from '@/types/domain';

/** 以显式 resolve/reject 控制真实异步顺序，不依赖固定延时。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** 完整任务保留预计与实际字段，检测保存过程是否误丢元数据。 */
function task(id = 'one'): Task {
  return {
    id,
    title: id,
    projectId: 'project',
    date: '2026-09-06',
    status: 'active',
    importance: 'normal',
    completed: false,
    plannedDurationMinutes: 40,
    actualDurationMinutes: 12,
    createdAt: '2026-09-06T00:00:00Z',
  };
}

/** 每个测试独立缓存和仓储；updateTaskFields 默认挂起，模拟手机上的请求延迟。 */
function setup(rows = [task()]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  client.setQueryData(['workspace', 'owner', 'tasks'], rows);
  const writes: ReturnType<typeof deferred<Task>>[] = [];
  const repository = {
    listTasks: vi.fn(async () => rows),
    updateTaskFields: vi.fn((_id: string, _patch: Partial<Task>, _expected: Task) => {
      void _id;
      void _patch;
      void _expected;
      const request = deferred<Task>();
      writes.push(request);
      return request.promise;
    }),
    listTaskTimeEntries: vi.fn(async (): Promise<TaskTimeEntry[]> => []),
  };
  const onError = vi.fn();
  /** 共享真实 QueryClient，让测试能模拟 Realtime 触发的后台 refetch。 */
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, repository, onError, writes, wrapper };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('cloud task save feedback', () => {
  it('keeps the actual TaskLine checked on the first click while saving and refreshing stale rows', async () => {
    const ctx = setup();
    /** 用正式任务行而非简化 checkbox 验证受控输入的事件结束状态。 */
    function Schedule() {
      const { tasks, updateTasks } = useCloudTaskUpdates(
        'owner',
        ctx.repository,
        ctx.onError,
      );
      return (
        <TaskLine
          task={tasks[0]}
          projects={[]}
          inSchedulePanel
          onEdit={() => {}}
          onMove={() => {}}
          onReschedule={() => {}}
          onUpdate={(next) =>
            updateTasks((rows) => rows.map((row) => (row.id === next.id ? next : row)))
          }
        />
      );
    }
    render(<Schedule />, { wrapper: ctx.wrapper });
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    await waitFor(() => expect(ctx.writes).toHaveLength(1));
    await act(() =>
      ctx.client.invalidateQueries({ queryKey: ['workspace', 'owner', 'tasks'] }),
    );
    expect(checkbox).toBeChecked();
    await act(async () =>
      ctx.writes[0].resolve({
        ...{
          ...ctx.repository.updateTaskFields.mock.calls[0][2],
          ...ctx.repository.updateTaskFields.mock.calls[0][1],
        },
        updatedAt: 'server',
      }),
    );
    expect(checkbox).toBeChecked();
    expect(
      ctx.client.getQueryData<Task[]>(['workspace', 'owner', 'tasks'])?.[0],
    ).toMatchObject({
      completed: true,
      plannedDurationMinutes: 40,
      actualDurationMinutes: 12,
      updatedAt: 'server',
    });
  });

  it('serializes check/uncheck and keeps the latest intent until its own response', async () => {
    const ctx = setup();
    const { result } = renderHook(
      () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError),
      { wrapper: ctx.wrapper },
    );
    act(() =>
      result.current.updateTasks((rows) =>
        rows.map((row) => ({ ...row, completed: true })),
      ),
    );
    await waitFor(() => expect(ctx.writes).toHaveLength(1));
    act(() =>
      result.current.updateTasks((rows) =>
        rows.map((row) => ({ ...row, completed: false })),
      ),
    );
    expect(result.current.tasks[0].completed).toBe(false);
    expect(ctx.writes).toHaveLength(1);
    await act(async () => ctx.writes[0].resolve({ ...task(), completed: true }));
    await waitFor(() => expect(ctx.writes).toHaveLength(2));
    expect(result.current.tasks[0].completed).toBe(false);
    await act(async () => ctx.writes[1].resolve(task()));
    expect(result.current.tasks[0].completed).toBe(false);
    expect(
      ctx.repository.updateTaskFields.mock.calls.map(([, patch]) => patch.completed),
    ).toEqual([true, false]);
  });

  it('does not restore another task when concurrent saves finish out of order', async () => {
    const ctx = setup([task(), task('two')]);
    const { result } = renderHook(
      () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError),
      { wrapper: ctx.wrapper },
    );
    act(() =>
      result.current.updateTasks((rows) =>
        rows.map((row) => ({ ...row, completed: true })),
      ),
    );
    await waitFor(() => expect(ctx.writes).toHaveLength(2));
    await act(async () => ctx.writes[1].resolve({ ...task('two'), completed: true }));
    await act(async () => ctx.writes[0].resolve({ ...task(), completed: true }));
    expect(result.current.tasks.map((row) => row.completed)).toEqual([true, true]);
  });

  it('rolls back only the failed task, shows an error, and accepts one-click retry', async () => {
    const ctx = setup([task(), task('two')]);
    const { result } = renderHook(
      () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError),
      { wrapper: ctx.wrapper },
    );
    act(() =>
      result.current.updateTasks((rows) =>
        rows.map((row) => ({ ...row, completed: true })),
      ),
    );
    await waitFor(() => expect(ctx.writes).toHaveLength(2));
    await act(async () => ctx.writes[1].resolve({ ...task('two'), completed: true }));
    await act(async () => ctx.writes[0].reject(new Error('network')));
    expect(result.current.tasks.map((row) => row.completed)).toEqual([false, true]);
    expect(ctx.onError).toHaveBeenCalledWith(expect.stringContaining('任务保存失败'));
    ctx.onError.mockClear();
    act(() =>
      result.current.updateTasks((rows) =>
        rows.map((row) => ({ ...row, completed: true })),
      ),
    );
    await waitFor(() => expect(ctx.writes).toHaveLength(3));
    expect(ctx.onError).not.toHaveBeenCalled();
    await act(async () => ctx.writes[2].reject(new Error('network')));
    expect(ctx.onError).toHaveBeenLastCalledWith(
      expect.stringContaining('任务保存失败'),
    );
    expect(ctx.onError).not.toHaveBeenCalledWith(undefined);
    ctx.onError.mockClear();
    act(() =>
      result.current.updateTasks((rows) =>
        rows.map((row) => ({ ...row, completed: true })),
      ),
    );
    await waitFor(() => expect(ctx.writes).toHaveLength(4));
    expect(ctx.onError).not.toHaveBeenCalled();
    await act(async () => ctx.writes[3].resolve({ ...task(), completed: true }));
    expect(ctx.onError).toHaveBeenLastCalledWith(undefined);
    expect(result.current.tasks.every((row) => row.completed)).toBe(true);
  });

  it('cannot clear a newer failure when an earlier unrelated save is confirmed', async () => {
    const ctx = setup([task(), task('two')]);
    const { result } = renderHook(
      () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError),
      { wrapper: ctx.wrapper },
    );
    act(() =>
      result.current.updateTasks((rows) =>
        rows.map((row) => ({ ...row, completed: true })),
      ),
    );
    await waitFor(() => expect(ctx.writes).toHaveLength(2));
    await act(async () => ctx.writes[1].reject(new Error('newer failure')));
    expect(ctx.onError).toHaveBeenLastCalledWith(
      expect.stringContaining('newer failure'),
    );
    ctx.onError.mockClear();
    await act(async () => ctx.writes[0].resolve({ ...task(), completed: true }));
    expect(ctx.onError).not.toHaveBeenCalled();
    expect(result.current.tasks.map((row) => row.completed)).toEqual([true, false]);
  });

  it.each(['fields', 'command'] as const)(
    '%s confirmation cannot remove a newer error from another workspace module',
    async (kind) => {
      const ctx = setup();
      const shared = createMutationFeedback(ctx.onError);
      const hook = renderHook(
        () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError, shared),
        { wrapper: ctx.wrapper },
      );
      const request = deferred<Task>();
      let command: Promise<Task> | undefined;
      act(() => {
        if (kind === 'fields')
          hook.result.current.updateTasks([{ ...task(), completed: true }]);
        else
          command = hook.result.current.commitTask(
            'one',
            (row) => ({ ...row, completed: true }),
            () => request.promise,
          );
      });
      if (kind === 'fields') await waitFor(() => expect(ctx.writes).toHaveLength(1));
      shared.report('项目创建失败');
      ctx.onError.mockClear();
      await act(async () => {
        if (kind === 'fields') ctx.writes[0].resolve({ ...task(), completed: true });
        else {
          request.resolve({ ...task(), completed: true });
          await command;
        }
      });
      expect(ctx.onError).not.toHaveBeenCalled();
      expect(hook.result.current.tasks[0].completed).toBe(true);
    },
  );

  it.each([
    ['offline', '当前离线，任务未保存。'],
    ['missing task', '未找到任务，请刷新后重试。'],
    ['write guard', '正在重启更新，请稍后再保存。'],
    ['missing baseline', '任务不存在，请重新加载。'],
  ] as const)(
    '%s rejection preserves its error when an older command and external operation succeed',
    async (failure, message) => {
      const ctx = setup([task(), task('two')]);
      const shared = createMutationFeedback(ctx.onError);
      const hook = renderHook(
        () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError, shared),
        { wrapper: ctx.wrapper },
      );
      const request = deferred<Task>();
      const operation = vi.fn(() => request.promise);
      shared.report('之前的保存失败');
      const confirmExternalOperation = shared.begin();
      let older!: Promise<Task>;
      act(() => {
        older = hook.result.current.commitTask(
          'one',
          (row) => ({ ...row, completed: true }),
          operation,
        );
      });
      try {
        await waitFor(() => expect(operation).toHaveBeenCalledOnce());
        expect(cloudWriteGuard.getPendingCloudWrites()).toBe(1);
        if (failure === 'offline')
          vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        if (failure === 'write guard')
          vi.spyOn(cloudWriteGuard, 'beginCloudWrite').mockImplementationOnce(() => {
            throw new Error(message);
          });
        const newerOperation = vi.fn(async () => task('two'));
        await act(async () => {
          const rejection =
            failure === 'missing baseline'
              ? hook.result.current.saveTaskConfirmed(task('missing'))
              : hook.result.current.commitTask(
                  failure === 'missing task' ? 'missing' : 'two',
                  (row) => row,
                  newerOperation,
                );
          await expect(rejection).rejects.toThrow(message);
        });
        expect(newerOperation).not.toHaveBeenCalled();
        expect(ctx.onError).toHaveBeenLastCalledWith(message);
        const callsAtFailure = ctx.onError.mock.calls.length;
        confirmExternalOperation();
        await act(async () => {
          request.resolve({ ...task(), completed: true });
          await older;
        });
        expect(hook.result.current.tasks[0].completed).toBe(true);
        expect(ctx.onError).toHaveBeenLastCalledWith(message);
        expect(ctx.onError).toHaveBeenCalledTimes(callsAtFailure);
        expect(cloudWriteGuard.getPendingCloudWrites()).toBe(0);
      } finally {
        request.resolve({ ...task(), completed: true });
        await older;
        await waitFor(() => expect(cloudWriteGuard.getPendingCloudWrites()).toBe(0));
      }
    },
  );

  it.each(['commit', 'confirmed save'] as const)(
    'a previous account %s rejects without reporting into the current account',
    async (method) => {
      const ctx = setup();
      const shared = createMutationFeedback(ctx.onError);
      ctx.client.setQueryDefaults(['workspace', 'other', 'tasks'], {
        staleTime: Infinity,
      });
      ctx.client.setQueryData(['workspace', 'other', 'tasks'], [task('two')]);
      const hook = renderHook(
        ({ owner }) => useCloudTaskUpdates(owner, ctx.repository, ctx.onError, shared),
        { wrapper: ctx.wrapper, initialProps: { owner: 'owner' } },
      );
      const previousAccount = hook.result.current;
      hook.rerender({ owner: 'other' });
      shared.report('当前账号的新错误');
      const callsAtFailure = ctx.onError.mock.calls.length;
      const operation = vi.fn(async () => task());
      await expect(
        method === 'commit'
          ? previousAccount.commitTask('one', (row) => row, operation)
          : previousAccount.saveTaskConfirmed(task('missing')),
      ).rejects.toThrow('账号会话已改变');
      expect(operation).not.toHaveBeenCalled();
      expect(ctx.repository.updateTaskFields).not.toHaveBeenCalled();
      expect(ctx.onError).toHaveBeenCalledTimes(callsAtFailure);
      expect(ctx.onError).toHaveBeenLastCalledWith('当前账号的新错误');
      expect(cloudWriteGuard.getPendingCloudWrites()).toBe(0);
    },
  );

  it('restores the last committed click when a later queued click fails', async () => {
    const ctx = setup();
    const { result } = renderHook(
      () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError),
      { wrapper: ctx.wrapper },
    );
    act(() => result.current.updateTasks([{ ...task(), completed: true }]));
    act(() => result.current.updateTasks([task()]));
    await waitFor(() => expect(ctx.writes).toHaveLength(1));
    await act(async () => ctx.writes[0].resolve({ ...task(), completed: true }));
    await waitFor(() => expect(ctx.writes).toHaveLength(2));
    ctx.repository.listTasks.mockResolvedValue([{ ...task(), completed: true }]);
    await act(async () => ctx.writes[1].reject(new Error('network')));
    expect(result.current.tasks[0].completed).toBe(true);
  });

  it('keeps committed completion when the separate ledger refresh fails', async () => {
    const ctx = setup();
    ctx.repository.listTaskTimeEntries.mockRejectedValue(
      new Error('ledger unavailable'),
    );
    const { result } = renderHook(
      () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError),
      { wrapper: ctx.wrapper },
    );
    act(() => result.current.updateTasks([{ ...task(), completed: true }]));
    await waitFor(() => expect(ctx.writes).toHaveLength(1));
    await act(async () => ctx.writes[0].resolve({ ...task(), completed: true }));
    await waitFor(() =>
      expect(ctx.onError).toHaveBeenCalledWith(expect.stringContaining('任务已保存')),
    );
    expect(result.current.tasks[0].completed).toBe(true);
  });

  it('rejects offline edits without changing the checkbox or writing', () => {
    const ctx = setup();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(
      () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError),
      { wrapper: ctx.wrapper },
    );
    act(() => result.current.updateTasks([{ ...task(), completed: true }]));
    expect(result.current.tasks[0].completed).toBe(false);
    expect(ctx.repository.updateTaskFields).not.toHaveBeenCalled();
    expect(ctx.onError).toHaveBeenCalledWith(expect.stringContaining('离线'));
  });

  it('does not expose a previous account pending edit after changing accounts', async () => {
    const ctx = setup();
    ctx.client.setQueryData(['workspace', 'other', 'tasks'], [task()]);
    const { result, rerender } = renderHook(
      ({ owner }) => useCloudTaskUpdates(owner, ctx.repository, ctx.onError),
      { wrapper: ctx.wrapper, initialProps: { owner: 'owner' } },
    );
    act(() => result.current.updateTasks([{ ...task(), completed: true }]));
    await waitFor(() => expect(ctx.writes).toHaveLength(1));
    rerender({ owner: 'other' });
    expect(result.current.tasks.some((row) => row.completed)).toBe(false);
    await waitFor(() => expect(result.current.tasks[0]?.completed).toBe(false));
    await act(async () => ctx.writes[0].resolve({ ...task(), completed: true }));
    expect(result.current.tasks[0].completed).toBe(false);
    expect(
      ctx.client.getQueryData<Task[]>(['workspace', 'other', 'tasks'])?.[0].completed,
    ).toBe(false);
  });

  it('cancels a stale in-flight task read when the save is confirmed', async () => {
    const ctx = setup();
    const { result } = renderHook(
      () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError),
      { wrapper: ctx.wrapper },
    );
    await waitFor(() => expect(result.current.query.isFetching).toBe(false));
    act(() => result.current.updateTasks([{ ...task(), completed: true }]));
    await waitFor(() => expect(ctx.writes).toHaveLength(1));
    const oldRead = deferred<Task[]>();
    ctx.repository.listTasks.mockReturnValueOnce(oldRead.promise);
    act(() => {
      void ctx.client.invalidateQueries({ queryKey: ['workspace', 'owner', 'tasks'] });
    });
    await waitFor(() => expect(result.current.query.isFetching).toBe(true));
    await act(async () => ctx.writes[0].resolve({ ...task(), completed: true }));
    await act(async () => oldRead.resolve([task()]));
    expect(result.current.tasks[0].completed).toBe(true);
    expect(
      ctx.client.getQueryData<Task[]>(['workspace', 'owner', 'tasks'])?.[0].completed,
    ).toBe(true);
  });
});

it('moves a task before the command resolves, isolates stale reads and rolls back on failure', async () => {
  const waiting = { ...task(), status: 'waiting' as const, date: undefined };
  const ctx = setup([waiting]);
  const hook = renderHook(
    () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError),
    { wrapper: ctx.wrapper },
  );
  const request = deferred<Task>();
  let result!: Promise<Task>;
  act(() => {
    result = hook.result.current.commitTask(
      waiting.id,
      (row) => ({ ...row, status: 'active', date: '2026-09-12' }),
      () => request.promise,
    );
  });
  const failure = result.catch(() => undefined);
  expect(hook.result.current.tasks[0].status).toBe('active');
  await act(() =>
    ctx.client.invalidateQueries({ queryKey: ['workspace', 'owner', 'tasks'] }),
  );
  expect(hook.result.current.tasks[0].status).toBe('active');
  await act(async () => {
    request.reject(new Error('拒绝安排'));
    await failure;
  });
  expect(hook.result.current.tasks[0].status).toBe('waiting');
  const confirmed = { ...waiting, status: 'active' as const, date: '2026-09-12' };
  const retry = deferred<Task>();
  ctx.onError.mockClear();
  act(() => {
    result = hook.result.current.commitTask(
      waiting.id,
      () => confirmed,
      () => retry.promise,
    );
  });
  expect(ctx.onError).not.toHaveBeenCalled();
  await act(async () => {
    retry.resolve(confirmed);
    await result;
  });
  expect(ctx.onError).toHaveBeenLastCalledWith(undefined);
  expect(hook.result.current.tasks[0]).toEqual(confirmed);
});

it('serializes field edits behind a failed command without saving its rejected status', async () => {
  const waiting = { ...task(), status: 'waiting' as const, date: undefined };
  const ctx = setup([waiting]);
  const hook = renderHook(
    () => useCloudTaskUpdates('owner', ctx.repository, ctx.onError),
    { wrapper: ctx.wrapper },
  );
  const request = deferred<Task>();
  let failure!: Promise<unknown>;
  act(() => {
    failure = hook.result.current
      .commitTask(
        waiting.id,
        (row) => ({ ...row, status: 'active', date: '2026-09-12' }),
        () => request.promise,
      )
      .catch(() => undefined);
  });
  act(() =>
    hook.result.current.updateTasks((rows) =>
      rows.map((row) => ({ ...row, title: '后续修改' })),
    ),
  );
  expect(ctx.repository.updateTaskFields).not.toHaveBeenCalled();
  await act(async () => {
    request.reject(new Error('失败'));
    await failure;
  });
  await waitFor(() => expect(ctx.writes).toHaveLength(1));
  expect({
    ...ctx.repository.updateTaskFields.mock.calls[0][2],
    ...ctx.repository.updateTaskFields.mock.calls[0][1],
  }).toMatchObject({
    title: '后续修改',
    status: 'waiting',
    date: undefined,
  });
  await act(async () =>
    ctx.writes[0].resolve({
      ...ctx.repository.updateTaskFields.mock.calls[0][2],
      ...ctx.repository.updateTaskFields.mock.calls[0][1],
    }),
  );
  expect(hook.result.current.tasks[0]).toMatchObject({
    title: '后续修改',
    status: 'waiting',
  });
});

it('a previous account response cannot clear the current account pending edit', async () => {
  const ctx = setup();
  const hook = renderHook(
    ({ owner }) => useCloudTaskUpdates(owner, ctx.repository, ctx.onError),
    { wrapper: ctx.wrapper, initialProps: { owner: 'owner' } },
  );
  act(() =>
    hook.result.current.updateTasks((rows) =>
      rows.map((row) => ({ ...row, completed: true })),
    ),
  );
  await waitFor(() => expect(ctx.writes).toHaveLength(1));
  ctx.client.setQueryDefaults(['workspace', 'other', 'tasks'], { staleTime: Infinity });
  ctx.client.setQueryData(['workspace', 'other', 'tasks'], [task('two')]);
  hook.rerender({ owner: 'other' });
  act(() =>
    hook.result.current.updateTasks((rows) =>
      rows.map((row) => ({ ...row, title: '新账号草稿' })),
    ),
  );
  await waitFor(() => expect(ctx.writes).toHaveLength(2));
  await act(async () => ctx.writes[0].resolve({ ...task(), completed: true }));
  expect(hook.result.current.tasks[0].title).toBe('新账号草稿');
  await act(async () => ctx.writes[1].resolve({ ...task('two'), title: '新账号草稿' }));
});

it('stops queued writes and ignores a late command failure after switching accounts', async () => {
  const ctx = setup();
  const hook = renderHook(
    ({ owner }) => useCloudTaskUpdates(owner, ctx.repository, ctx.onError),
    { wrapper: ctx.wrapper, initialProps: { owner: 'owner' } },
  );
  const request = deferred<Task>();
  const operation = vi.fn(() => request.promise);
  let result!: Promise<unknown>;
  act(() => {
    result = hook.result.current
      .commitTask('one', (row) => row, operation)
      .catch(() => undefined);
    hook.result.current.updateTasks((rows) =>
      rows.map((row) => ({ ...row, title: 'queued' })),
    );
  });
  await waitFor(() => expect(operation).toHaveBeenCalledOnce());
  hook.rerender({ owner: 'other' });
  ctx.onError.mockClear();
  await act(async () => {
    request.reject(new Error('old session failure'));
    await result;
  });
  expect(ctx.repository.updateTaskFields).not.toHaveBeenCalled();
  expect(ctx.onError).not.toHaveBeenCalled();
});
