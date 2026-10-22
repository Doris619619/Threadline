/** @fileoverview 验证本机独占确认后首页与计时站先于云端收起、三路保存失败恢复及刷新后的原意图重试。 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { TaskTimers } from '@/features/tasks/components/task-timers';
import type { TaskTimer } from '@/features/tasks/timer-rules';
import type { Task } from '@/types/domain';

const runtime = vi.hoisted(() => ({
  tasks: [] as Task[],
  record: vi.fn(),
  stationHost: null as HTMLElement | null,
}));
vi.mock('@/components/app-shell', () => ({
  useWorkspaceView: () => ({ active: 'home' }),
}));
vi.mock('@/lib/desktop-window-context', () => ({
  useDesktopWindow: () => ({ isWorkstation: false }),
}));
vi.mock('@/features/auth/cloud-runtime-provider', () => ({
  useOptionalCloudRuntime: () => null,
}));
vi.mock('@/features/workspace/workspace-data-context', () => ({
  useWorkspaceData: () => ({
    tasks: runtime.tasks,
    projects: [],
    recordTaskActual: runtime.record,
    hydrated: true,
  }),
}));
vi.mock('@/features/tasks/hooks/use-timer-station', () => ({
  useTimerStation: () => ({ host: runtime.stationHost, error: '' }),
}));

const storageKey = 'threadline.task-timers.v1:local';
const stamp = Date.parse('2026-10-18T12:00:00Z');

/** 手动控制云端成功或失败，断言卡片收起时请求仍未完成。 */
function deferred() {
  let resolve!: (task: Task) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Task>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** 读取真实本机缓存，确保视觉移除没有提前删除待保存记录。 */
function storedTimers(): TaskTimer[] {
  return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as TaskTimer[];
}

/** 从现有缓存挂载两个真实展示面；刷新复用此入口，不重新种入计时器或覆盖 pending。 */
async function mountTimers(count: number) {
  runtime.stationHost?.remove();
  runtime.stationHost = document.createElement('div');
  document.body.append(runtime.stationHost);
  const view = render(
    <TaskTimers>
      <div id="home-timer-slot" />
    </TaskTimers>,
  );
  const home = document.getElementById('home-timer-slot')!;
  const station = runtime.stationHost;
  await waitFor(() => expect(home.querySelectorAll('.task-timer')).toHaveLength(count));
  await waitFor(() =>
    expect(station.querySelectorAll('.task-timer')).toHaveLength(count),
  );
  return { ...view, home, station };
}

/** 创建指定数量任务与运行中的一分钟计时，再挂载共享会话；仅首次启动写入种子数据。 */
async function setup(count = 2) {
  runtime.tasks = Array.from({ length: count }, (_, index) => ({
    id: `task-${index}`,
    title: `课程任务 ${index}`,
    projectId: 'project',
    completed: false,
    status: 'active',
    importance: 'normal',
    date: '2026-10-18',
    createdAt: '2026-10-18',
    updatedAt: '2026-10-18',
  }));
  localStorage.setItem(
    storageKey,
    JSON.stringify(
      runtime.tasks.map((task) => ({
        id: `timer-${task.id}`,
        taskId: task.id,
        title: task.title,
        mode: 'up',
        targetMs: 60000,
        elapsedMs: 0,
        startedAt: stamp - 60000,
        firstStartedAt: stamp - 60000,
        entryDate: '2026-10-18',
        intervals: [],
        timezone: 'UTC',
      })),
    ),
  );
  return mountTimers(count);
}

beforeEach(() => {
  localStorage.clear();
  runtime.record.mockReset();
  vi.spyOn(Date, 'now').mockReturnValue(stamp);
});

afterEach(() => {
  cleanup();
  runtime.stationHost?.remove();
  runtime.stationHost = null;
  localStorage.clear();
  vi.restoreAllMocks();
});

test('completion disappears from both views before saving while other timers remain interactive', async () => {
  const pending = deferred();
  runtime.record.mockReturnValue(pending.promise);
  const { home, station } = await setup();
  const homeCard = within(home).getByRole('article', { name: '计时 课程任务 0' });
  const stationCard = within(station).getByRole('article', { name: '计时 课程任务 0' });
  const duplicate = within(homeCard).getByRole('button', { name: '完成并记耗时' });
  fireEvent.click(within(stationCard).getByRole('button', { name: '完成并记耗时' }));
  fireEvent.click(duplicate);

  // 只等待本机独占提交，云 Promise 在以下断言完成前保持未决。
  await waitFor(() => {
    expect(home).not.toContainElement(homeCard);
    expect(station).not.toContainElement(stationCard);
    expect(runtime.record).toHaveBeenCalledTimes(1);
  });
  expect(storedTimers()[0]).toMatchObject({
    elapsedMs: 60000,
    pending: { minutes: 1, recording: { id: 'timer-task-0' } },
  });
  expect(storedTimers()[0].startedAt).toBeUndefined();
  const other = within(station).getByRole('article', { name: '计时 课程任务 1' });
  fireEvent.click(within(other).getByRole('button', { name: '暂停' }));
  await waitFor(() =>
    expect(within(other).getByRole('button', { name: '继续' })).toBeEnabled(),
  );

  await act(async () => pending.resolve({ ...runtime.tasks[0], completed: true }));
  await waitFor(() =>
    expect(storedTimers().map((timer) => timer.taskId)).toEqual(['task-1']),
  );
  expect(home.querySelectorAll('.task-timer')).toHaveLength(1);
  expect(station.querySelectorAll('.task-timer')).toHaveLength(1);
});

test('a failed last card restores in both views and retries the same persisted recording', async () => {
  const first = deferred();
  const retry = deferred();
  runtime.record.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
  const { home, station } = await setup(1);
  fireEvent.click(within(station).getByRole('button', { name: '完成并记耗时' }));
  await waitFor(() => {
    expect(home.querySelector('.task-timer')).toBeNull();
    expect(station.querySelector('.task-timer')).toBeNull();
    expect(runtime.record).toHaveBeenCalledTimes(1);
  });
  expect(station.querySelector('.timer-station')).toHaveAttribute('data-empty', 'true');
  const frozen = storedTimers()[0].pending;

  await act(async () => first.reject(new Error('网络失败，请重试')));
  await waitFor(() => {
    expect(within(home).getByRole('alert')).toHaveTextContent('网络失败，请重试');
    expect(within(station).getByRole('alert')).toHaveTextContent('网络失败，请重试');
  });
  expect(station.querySelector('.timer-station')).toHaveAttribute(
    'data-empty',
    'false',
  );
  expect(storedTimers()[0].pending).toEqual(frozen);

  runtime.tasks = [{ ...runtime.tasks[0], actualDurationMinutes: 90 }];
  vi.mocked(Date.now).mockReturnValue(stamp + 600000);
  fireEvent.click(within(home).getByRole('button', { name: '完成并记耗时' }));
  await waitFor(() => {
    expect(station.querySelector('.task-timer')).toBeNull();
    expect(runtime.record).toHaveBeenCalledTimes(2);
  });
  expect(runtime.record.mock.calls[1]).toEqual(runtime.record.mock.calls[0]);
  await act(async () => retry.resolve({ ...runtime.tasks[0], completed: true }));
  await waitFor(() => expect(storedTimers()).toEqual([]));
  expect(home.querySelector('.task-timer')).toBeNull();
  expect(station.querySelector('.task-timer')).toBeNull();
});

test('concurrent completions restore only the failed timer and preserve the successful removal', async () => {
  const first = deferred();
  const second = deferred();
  runtime.record.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { home, station } = await setup();
  const finish = within(station).getAllByRole('button', { name: '完成并记耗时' });
  fireEvent.click(finish[0]);
  fireEvent.click(finish[1]);
  await waitFor(() => {
    expect(station.querySelector('.task-timer')).toBeNull();
    expect(runtime.record).toHaveBeenCalledTimes(2);
  });
  await act(async () => second.resolve({ ...runtime.tasks[1], completed: true }));
  await act(async () => first.reject(new Error('第一个保存失败')));
  await waitFor(() =>
    expect(storedTimers().map((timer) => timer.taskId)).toEqual(['task-0']),
  );
  expect(within(home).getByRole('article', { name: '计时 课程任务 0' })).toBeVisible();
  expect(within(station).getByRole('alert')).toHaveTextContent('第一个保存失败');
  expect(station.querySelectorAll('.task-timer')).toHaveLength(1);
});

/** 三次完成分别成功、失败和响应丢失；刷新后只重试未确认记录，逐字段保留原提交意图。 */
test('three concurrent completions recover failed and unknown requests after refresh with identical recordings', async () => {
  const success = deferred();
  const failure = deferred();
  const unknown = deferred();
  runtime.record
    .mockReturnValueOnce(success.promise)
    .mockReturnValueOnce(failure.promise)
    .mockReturnValueOnce(unknown.promise);
  const firstView = await setup(3);
  const finish = within(firstView.station).getAllByRole('button', {
    name: '完成并记耗时',
  });
  for (const button of finish) fireEvent.click(button);
  await waitFor(() => {
    expect(runtime.record).toHaveBeenCalledTimes(3);
    expect(firstView.home.querySelector('.task-timer')).toBeNull();
    expect(firstView.station.querySelector('.task-timer')).toBeNull();
  });
  const originalRequests = new Map(
    runtime.record.mock.calls.map((args) => [(args[0] as Task).id, args]),
  );
  const originalPending = storedTimers().map((timer) => timer.pending);
  expect(originalPending).toHaveLength(3);
  for (const [index, timer] of storedTimers().entries()) {
    expect(timer).toMatchObject({
      elapsedMs: 60000,
      pending: {
        minutes: 1,
        recording: {
          id: `timer-task-${index}`,
          timezone: 'UTC',
          intervals: [{ start: stamp - 60000, end: stamp }],
        },
      },
    });
    expect(timer.startedAt).toBeUndefined();
  }

  await act(async () => {
    success.resolve({ ...runtime.tasks[0], completed: true });
    failure.reject(new Error('第二个保存失败'));
  });
  await waitFor(() => {
    expect(storedTimers().map((timer) => timer.taskId)).toEqual(['task-1', 'task-2']);
    expect(within(firstView.home).getByRole('alert')).toHaveTextContent(
      '第二个保存失败',
    );
    expect(firstView.station.querySelectorAll('.task-timer')).toHaveLength(1);
  });
  expect(storedTimers().map((timer) => timer.pending)).toEqual(
    originalPending.slice(1),
  );

  firstView.unmount();
  vi.mocked(Date.now).mockReturnValue(stamp + 600000);
  runtime.tasks = runtime.tasks.map((task, index) => ({
    ...task,
    completed: index === 0,
    actualDurationMinutes: index === 0 ? 1 : 90,
  }));
  const restored = await mountTimers(2);
  expect(storedTimers().map((timer) => timer.pending)).toEqual(
    originalPending.slice(1),
  );
  expect(runtime.record).toHaveBeenCalledTimes(3);
  for (const task of runtime.tasks.slice(1)) {
    const card = within(restored.home).getByRole('article', {
      name: '计时 ' + task.title,
    });
    expect(within(card).getByLabelText('正计时已暂停')).toHaveTextContent('00:01:00');
    expect(within(card).getByRole('button', { name: '继续' })).toBeDisabled();
  }

  const retryFailure = deferred();
  const retryUnknown = deferred();
  runtime.record
    .mockReturnValueOnce(retryFailure.promise)
    .mockReturnValueOnce(retryUnknown.promise);
  for (const button of within(restored.home).getAllByRole('button', {
    name: '完成并记耗时',
  })) {
    fireEvent.click(button);
    fireEvent.click(button);
  }
  await waitFor(() => {
    expect(runtime.record).toHaveBeenCalledTimes(5);
    expect(restored.home.querySelector('.task-timer')).toBeNull();
    expect(restored.station.querySelector('.task-timer')).toBeNull();
  });
  for (const args of runtime.record.mock.calls.slice(3)) {
    expect(args).toEqual(originalRequests.get((args[0] as Task).id));
  }
  expect(
    runtime.record.mock.calls.filter((args) => (args[0] as Task).id === 'task-0'),
  ).toHaveLength(1);
  await act(async () => {
    retryFailure.resolve({ ...runtime.tasks[1], completed: true });
    retryUnknown.resolve({ ...runtime.tasks[2], completed: true });
  });
  await waitFor(() => {
    expect(storedTimers()).toEqual([]);
    expect(restored.home.querySelector('.task-timer')).toBeNull();
    expect(restored.station.querySelector('.task-timer')).toBeNull();
  });
});

/** 云端已经成功时，本机删除失败须恢复同一冻结记录；重试不能把等待时间或新余额加入原意图。 */
test('failed local cleanup after cloud success restores both views and retries the identical saved intent', async () => {
  const remote = deferred();
  const retry = deferred();
  runtime.record.mockReturnValueOnce(remote.promise).mockReturnValueOnce(retry.promise);
  const { home, station } = await setup(1);
  fireEvent.click(within(home).getByRole('button', { name: '完成并记耗时' }));
  await waitFor(() => {
    expect(runtime.record).toHaveBeenCalledTimes(1);
    expect(home.querySelector('.task-timer')).toBeNull();
    expect(station.querySelector('.task-timer')).toBeNull();
  });
  const frozen = storedTimers()[0].pending;
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new DOMException('cleanup quota', 'QuotaExceededError');
  });
  await act(async () => remote.resolve({ ...runtime.tasks[0], completed: true }));
  await waitFor(() => {
    expect(
      within(home).getByRole('article', { name: '计时 课程任务 0' }),
    ).toBeVisible();
    expect(within(home).getByRole('alert')).toHaveTextContent('计时未能移除，请重试。');
    expect(within(station).getByRole('alert')).toHaveTextContent(
      '计时未能移除，请重试。',
    );
  });
  expect(storedTimers()[0].pending).toEqual(frozen);
  expect(storedTimers()[0].startedAt).toBeUndefined();
  write.mockRestore();
  runtime.tasks = [{ ...runtime.tasks[0], completed: true, actualDurationMinutes: 90 }];
  vi.mocked(Date.now).mockReturnValue(stamp + 600000);
  fireEvent.click(within(home).getByRole('button', { name: '完成并记耗时' }));
  await waitFor(() => {
    expect(runtime.record).toHaveBeenCalledTimes(2);
    expect(home.querySelector('.task-timer')).toBeNull();
    expect(station.querySelector('.task-timer')).toBeNull();
  });
  expect(runtime.record.mock.calls[1]).toEqual(runtime.record.mock.calls[0]);
  expect(storedTimers()[0].pending).toEqual(frozen);
  await act(async () => retry.resolve({ ...runtime.tasks[0], completed: true }));
  await waitFor(() => expect(storedTimers()).toEqual([]));
  expect(home.querySelector('.task-timer')).toBeNull();
  expect(station.querySelector('.task-timer')).toBeNull();
});
