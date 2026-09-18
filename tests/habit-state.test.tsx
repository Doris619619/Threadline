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
import {
  DEFAULT_RULES,
  type HabitEntry,
  type HabitRequest,
} from '@/features/habits/habit-types';
const view = vi.hoisted(() => ({ active: 'home' }));
vi.mock('@/components/app-shell', () => ({ useWorkspaceView: () => view }));
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
afterEach(() => {
  vi.restoreAllMocks();
  view.active = 'home';
});
it('preloads before navigation and reuses covered ranges and cached remounts without a loading flash', async () => {
  const task = setup();
  await waitFor(() => expect(task.result.current.ready).toBe(true));
  expect(view.active).toBe('home');
  const [start, end] = vi.mocked(task.repository.list).mock.calls[0];
  act(() => task.result.current.setRange(start, end));
  view.active = 'habits';
  task.rerender();
  expect(task.result.current.loading).toBe(false);
  expect(task.repository.list).toHaveBeenCalledTimes(1);
  task.unmount();
  const reopened = renderHook(() => useHabits(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={task.client}>
        <HabitStore repository={task.repository}>{children}</HabitStore>
      </QueryClientProvider>
    ),
  });
  expect(reopened.result.current.ready).toBe(true);
  expect(reopened.result.current.loading).toBe(false);
  expect(task.repository.list).toHaveBeenCalledTimes(1);
  // 范围内切换周/月不会换查询键；后台失败仍保留原页面。
  act(() => reopened.result.current.setRange(end, end));
  expect(reopened.result.current.ready).toBe(true);
  expect(task.repository.list).toHaveBeenCalledTimes(1);
  vi.mocked(task.repository.list).mockRejectedValue(new Error('offline read'));
  act(() => reopened.result.current.retry());
  await waitFor(() => expect(reopened.result.current.error).toContain('offline read'));
  expect(reopened.result.current.ready).toBe(true);
  expect(reopened.result.current.loading).toBe(false);
});
it('immediately retains confirmed timezone when the following read fails or is stale', async () => {
  const task = setup();
  await waitFor(() => expect(task.result.current.ready).toBe(true));
  const settings = { ...emptyHabitData('Asia/Shanghai').settings, version: 1 };
  vi.mocked(task.repository.configure).mockResolvedValue(settings);
  vi.mocked(task.repository.list).mockRejectedValue(new Error('read failed'));
  await act(async () => {
    await task.result.current.configure(
      'Asia/Shanghai',
      DEFAULT_RULES,
      0,
      'settings-id',
    );
  });
  expect(task.result.current.data.settings).toEqual(settings);
  await waitFor(() => expect(task.result.current.notice).toContain('read failed'));
  vi.mocked(task.repository.list).mockResolvedValue(emptyHabitData('UTC'));
  await act(async () => task.result.current.retry());
  await waitFor(() => expect(task.result.current.notice).toBeUndefined());
  expect(task.result.current.data.settings.timezone).toBe('Asia/Shanghai');
});
it('never reuses the previous account cache while a different account is loading', async () => {
  const task = setup();
  await waitFor(() => expect(task.result.current.ready).toBe(true));
  await act(async () => {
    await task.result.current.save(request);
  });
  expect(task.result.current.data.entries).toEqual(saved);
  task.unmount();
  const other = {
    ...task.repository,
    owner: 'second',
    list: vi.fn(() => new Promise<ReturnType<typeof emptyHabitData>>(() => undefined)),
  };
  const next = renderHook(() => useHabits(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={task.client}>
        <HabitStore repository={other}>{children}</HabitStore>
      </QueryClientProvider>
    ),
  });
  expect(next.result.current.loading).toBe(true);
  expect(next.result.current.ready).toBe(false);
  expect(next.result.current.data.entries).toEqual([]);
});
it('retains confirmed versions after remount when a background read is stale', async () => {
  const task = setup();
  await waitFor(() => expect(task.result.current.ready).toBe(true));
  await act(async () => {
    await task.result.current.save(request);
  });
  task.unmount();
  const reopened = renderHook(() => useHabits(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={task.client}>
        <HabitStore repository={task.repository}>{children}</HabitStore>
      </QueryClientProvider>
    ),
  });
  expect(reopened.result.current.data.entries).toEqual(saved);
  const calls = vi.mocked(task.repository.list).mock.calls.length;
  act(() => reopened.result.current.retry());
  await waitFor(() => expect(task.repository.list).toHaveBeenCalledTimes(calls + 1));
  await waitFor(() => expect(task.client.isFetching()).toBe(0));
  expect(reopened.result.current.data.entries).toEqual(saved);
});
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
  expect(task.repository.list).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.any(String),
    expect.any(AbortSignal),
    [saved[0].id],
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
it('allows an explicit corrected date and adopted identity after a conflict', async () => {
  const apply = vi
    .fn<HabitRepository['apply']>()
    .mockRejectedValueOnce(new Error('conflict'))
    .mockResolvedValue(saved);
  const task = setup(apply);
  await waitFor(() => expect(task.result.current.ready).toBe(true));
  const original: HabitRequest = {
    ...request,
    changes: [
      {
        mode: 'edit',
        kind: 'wake',
        business_date: '2026-09-11',
        occurred_at: request.changes[0].occurred_at,
      },
    ],
  };
  await act(async () => {
    await expect(task.result.current.save(original)).rejects.toThrow('conflict');
  });
  const corrected: HabitRequest = {
    ...original,
    requestId: 'corrected',
    changes: [
      {
        ...original.changes[0],
        id: 'adopted',
        expected_version: 2,
        business_date: '2026-09-12',
      },
    ],
  };
  await act(async () => {
    await task.result.current.save(corrected);
  });
  expect(apply).toHaveBeenLastCalledWith(corrected);
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
