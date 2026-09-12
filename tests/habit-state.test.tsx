/** @fileoverview 验证首次反馈、稳定重试、陈旧刷新和账号离开后的写入隔离。 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  HabitStore,
  useHabits,
  type HabitRepository,
} from '@/features/habits/habit-state';
import {
  applyLocalHabitRequest,
  emptyHabitData,
} from '@/features/habits/habit-local-repository';
import type { HabitEntry, HabitRequest } from '@/features/habits/habit-types';
vi.mock('@/components/app-shell', () => ({
  useWorkspaceView: () => ({ active: 'habits' }),
}));
vi.mock('@/lib/cloud-write-guard', () => ({ beginCloudWrite: () => vi.fn() }));
const request: HabitRequest = {
  requestId: 'stable-id',
  timezone: 'UTC',
  settingsVersion: 0,
  changes: [{ mode: 'record', kind: 'wake', occurred_at: '2026-09-12T06:47:12.345Z' }],
};
const saved = applyLocalHabitRequest(
  emptyHabitData('UTC'),
  request,
  '2026-09-12T12:00:00Z',
).entries;
/** 用可控仓储驱动真实 React Query 状态，列表故意保持陈旧。 */
function setup(apply = vi.fn<HabitRepository['apply']>(async () => saved)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const repository: HabitRepository = {
    owner: 'first',
    list: vi.fn(async () => emptyHabitData('UTC')),
    apply,
    configure: vi.fn(),
    subscribe: () => () => undefined,
  };
  const hook = renderHook(() => useHabits(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <HabitStore repository={repository}>{children}</HabitStore>
      </QueryClientProvider>
    ),
  });
  return { ...hook, client, repository, apply };
}
afterEach(() => vi.restoreAllMocks());
it('shows the frozen first click immediately and never lets stale lists erase confirmation', async () => {
  let resolve!: (rows: HabitEntry[]) => void;
  const task = setup(
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );
  await waitFor(() => expect(task.result.current.ready).toBe(true));
  let writing!: Promise<void>;
  act(() => {
    writing = task.result.current.save(request);
  });
  expect(task.result.current.busy).toBe(true);
  expect(task.result.current.pending).toEqual(request);
  await act(async () => {
    await expect(task.result.current.save(request)).rejects.toThrow('正在保存');
  });
  expect(task.apply).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve(saved);
    await writing;
  });
  await waitFor(() => expect(task.result.current.data.entries).toEqual(saved));
  act(() => task.result.current.retry());
  await waitFor(() => expect(task.repository.list).toHaveBeenCalledTimes(3));
  expect(task.result.current.data.entries[0].occurred_at).toBe(
    request.changes[0].occurred_at,
  );
});
it('retains the original ID and instant after a failed write', async () => {
  const apply = vi
    .fn<HabitRepository['apply']>()
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValue(saved);
  const task = setup(apply);
  await waitFor(() => expect(task.result.current.ready).toBe(true));
  await act(async () => {
    await expect(task.result.current.save(request)).rejects.toThrow('timeout');
  });
  expect(task.result.current.pending).toEqual(request);
  await act(async () => {
    task.result.current.retry();
  });
  expect(task.result.current.error).toBe('timeout');
  await act(async () => {
    await expect(
      task.result.current.save({
        ...request,
        requestId: 'another',
        changes: [
          {
            mode: 'record',
            kind: 'sleep',
            occurred_at: request.changes[0].occurred_at,
          },
        ],
      }),
    ).rejects.toThrow('上一份');
  });
  expect(task.result.current.pending).toEqual(request);
  await act(async () => {
    await task.result.current.save(task.result.current.pending!);
  });
  expect(apply.mock.calls[0][0]).toEqual(apply.mock.calls[1][0]);
  expect(task.result.current.pending).toBeNull();
});
it('does not roll back confirmation when statistics refresh fails', async () => {
  const task = setup();
  await waitFor(() => expect(task.result.current.ready).toBe(true));
  vi.mocked(task.repository.list).mockRejectedValue(new Error('read failed'));
  await act(async () => {
    await task.result.current.save(request);
  });
  await waitFor(() => expect(task.result.current.notice).toContain('记录已保存'));
  expect(task.result.current.data.entries).toEqual(saved);
  expect(task.result.current.pending).toBeNull();
});
it('keeps an offline draft without calling the transport', async () => {
  const task = setup();
  await waitFor(() => expect(task.result.current.ready).toBe(true));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await act(async () => {
    await expect(task.result.current.save(request)).rejects.toThrow('离线');
  });
  expect(task.apply).not.toHaveBeenCalled();
  expect(task.result.current.pending).toEqual(request);
});
it('ignores a late write response after the account store unmounts', async () => {
  let resolve!: (rows: HabitEntry[]) => void;
  const task = setup(
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );
  await waitFor(() => expect(task.result.current.ready).toBe(true));
  let writing!: Promise<void>;
  act(() => {
    writing = task.result.current.save(request);
  });
  task.unmount();
  await act(async () => {
    resolve(saved);
    await writing;
  });
  const cached = task.client.getQueriesData<{ entries: HabitEntry[] }>({
    queryKey: ['habits'],
  });
  expect(cached.every(([, value]) => value?.entries.length === 0)).toBe(true);
});
