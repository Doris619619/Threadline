/** @fileoverview 验证真实习惯状态在延迟确认、失败重试及范围扩展时保持可见内容与读取边界。 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HabitsPanel } from '@/features/habits/habits-panel';
import { HabitStore, type HabitRepository } from '@/features/habits/habit-state';
import {
  applyLocalHabitRequest,
  emptyHabitData,
} from '@/features/habits/habit-local-repository';
import type {
  HabitData,
  HabitEntry,
  HabitRequest,
} from '@/features/habits/habit-types';

vi.mock('@/features/habits/habit-trends', () => ({
  HabitTimeTrend: () => <p>时间图表</p>,
}));
vi.mock('@/lib/cloud-write-guard', () => ({ beginCloudWrite: () => vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-10-10T08:00:00Z');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 使用真实 Query 状态和页面，仓储边界允许延迟响应，不访问账号或本机任务。 */
function setup(initial = emptyHabitData('UTC')) {
  const repository: HabitRepository = {
    owner: 'feedback-test',
    list: vi.fn(async () => initial),
    apply: vi.fn(),
    configure: vi.fn(),
    subscribe: () => () => undefined,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <HabitStore repository={repository}>
        <HabitsPanel />
      </HabitStore>
    </QueryClientProvider>,
  );
  return { ...view, repository, client };
}

it('keeps the time button and frozen value through a delayed confirmation without progress text', async () => {
  const task = setup();
  let resolve!: (rows: HabitEntry[]) => void;
  vi.mocked(task.repository.apply).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const button = await screen.findByRole('button', { name: '起床了' });
  fireEvent.click(button);
  const pending = screen.getByRole('button', { name: '编辑起床时间 08:00' });
  expect(pending).toBe(button);
  expect(pending).toBeDisabled();
  expect(screen.queryByText(/保存中|正在保存|尚未保存/)).toBeNull();
  const request = vi.mocked(task.repository.apply).mock.calls[0][0];
  const saved = applyLocalHabitRequest(
    emptyHabitData('UTC'),
    request,
    '2026-10-10T08:00:00Z',
  );
  await act(async () => resolve(saved.entries));
  await waitFor(() => expect(pending).toBeEnabled());
  expect(screen.getByRole('button', { name: '编辑起床时间 08:00' })).toBe(pending);
  expect(screen.queryByText(/保存中|正在保存/)).toBeNull();
});

it('keeps an efficiency draft and its failure visible while retrying the same request', async () => {
  const initialRequest: HabitRequest = {
    requestId: 'initial-efficiency',
    timezone: 'UTC',
    settingsVersion: 0,
    changes: [
      {
        mode: 'record',
        kind: 'efficiency',
        occurred_at: '2026-10-10T08:00:00Z',
        efficiency: 'good',
      },
    ],
  };
  const initial = applyLocalHabitRequest(
    emptyHabitData('UTC'),
    initialRequest,
    '2026-10-10T08:00:00Z',
  );
  const task = setup(initial);
  let resolve!: (rows: HabitEntry[]) => void;
  vi.mocked(task.repository.apply)
    .mockRejectedValueOnce(new Error('timeout'))
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
  const choice = await screen.findByRole('button', { name: '差', exact: true });
  fireEvent.click(choice);
  await screen.findByText('timeout');
  expect(choice).toHaveAttribute('aria-pressed', 'true');
  const notice = screen.getByText('状态尚未保存');
  fireEvent.click(screen.getByRole('button', { name: '重试原记录' }));
  expect(notice).toBeVisible();
  expect(screen.getByText('timeout')).toBeVisible();
  expect(choice).toHaveAttribute('aria-pressed', 'true');
  expect(choice).toBeDisabled();
  const request = vi.mocked(task.repository.apply).mock.calls[1][0];
  expect(request).toEqual(vi.mocked(task.repository.apply).mock.calls[0][0]);
  await act(async () =>
    resolve(applyLocalHabitRequest(initial, request, '2026-10-10T08:00:00Z').entries),
  );
  await waitFor(() => expect(screen.queryByText('timeout')).toBeNull());
  expect(choice).toHaveAttribute('aria-pressed', 'true');
});

it('retains today while unread history and statistics remain explicitly unavailable', async () => {
  const request: HabitRequest = {
    requestId: 'known-wake',
    timezone: 'UTC',
    settingsVersion: 0,
    changes: [{ mode: 'record', kind: 'wake', occurred_at: '2026-10-10T08:00:00Z' }],
  };
  const initial = applyLocalHabitRequest(
    emptyHabitData('UTC'),
    request,
    '2026-10-10T08:00:00Z',
  );
  const task = setup(initial);
  const today = await screen.findByRole('button', { name: '编辑起床时间 08:00' });
  const summary = task.container.querySelector('.habit-summary');
  const efficiencyDays = task.container.querySelector('.habit-status-days');
  let resolve!: (data: HabitData) => void;
  vi.mocked(task.repository.list).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: '上个月历史' }));
  expect(screen.getByRole('button', { name: '2026-08-31 尚未读取' })).toBeDisabled();
  for (let index = 0; index < 6; index++)
    fireEvent.click(screen.getByRole('button', { name: '上个统计周期' }));
  expect(screen.getAllByText('范围尚未读取')).toHaveLength(3);
  expect(task.container.querySelector('.habit-summary')).toBe(summary);
  expect(summary!.children).toHaveLength(3);
  expect(task.container.querySelector('.habit-status-days')).toBe(efficiencyDays);
  expect(
    screen.getByRole('button', { name: '2026-08-24 工作效率 尚未读取' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: '编辑起床时间 08:00' })).toBe(today);
  expect(screen.queryByText('正在读取习惯记录…')).toBeNull();
  await act(async () => resolve(initial));
  await waitFor(() => expect(screen.queryAllByText('范围尚未读取')).toHaveLength(0));
  expect(screen.getByRole('button', { name: '2026-08-31 未记录' })).toBeEnabled();
});

it('retains a newly confirmed check-in while expanded reads are stale, fail or lose the old cache', async () => {
  const task = setup();
  const record = await screen.findByRole('button', { name: '起床了' });
  const originalKey = task.client.getQueriesData<HabitData>({
    queryKey: ['habits', task.repository.owner],
  })[0][0];
  const reads: {
    resolve: (data: HabitData) => void;
    reject: (reason: Error) => void;
  }[] = [];
  vi.mocked(task.repository.list).mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        reads.push({ resolve, reject });
      }),
  );
  vi.mocked(task.repository.apply).mockImplementation(
    async (request) =>
      applyLocalHabitRequest(emptyHabitData('UTC'), request, '2026-10-10T08:00:00Z')
        .entries,
  );
  fireEvent.click(screen.getByRole('button', { name: '上个月历史' }));
  fireEvent.click(record);
  const time = screen.getByRole('button', { name: '编辑起床时间 08:00' });
  await waitFor(() => expect(time).toBeEnabled());
  await waitFor(() => expect(reads.length).toBeGreaterThanOrEqual(2));
  // 已取消的旧扩展请求迟到也不能撤掉刚保存的打卡。
  await act(async () => reads[0].resolve(emptyHabitData('UTC')));
  act(() => task.client.removeQueries({ queryKey: originalKey, exact: true }));
  await act(async () => reads.at(-1)!.reject(new Error('expanded read failed')));
  await screen.findByText('expanded read failed');
  expect(screen.getByRole('button', { name: '编辑起床时间 08:00' })).toBe(time);
  expect(screen.queryByRole('button', { name: '起床了' })).toBeNull();
  expect(screen.getByRole('button', { name: '2026-08-31 尚未读取' })).toBeDisabled();
  expect(screen.queryByText('正在读取习惯记录…')).toBeNull();
  // 失败后切回已确认月份可以编辑，切回未读月份仍保持锁定，而非伪装为空记录。
  fireEvent.click(screen.getByRole('button', { name: '下个月历史' }));
  expect(screen.getByRole('button', { name: '2026-09-28 未记录' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '上个月历史' }));
  expect(screen.getByRole('button', { name: '2026-08-31 尚未读取' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '编辑起床时间 08:00' })).toBe(time);
});
