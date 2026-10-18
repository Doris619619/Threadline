/** @fileoverview 用挂起的保存请求验证首页与计时站即时收起、失败恢复和原计时意图持久化。 */
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

/** 挂载两个真实卡片展示面，共用会话与持久化 Hook，仅替换云命令和原生窗口入口。 */
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

  expect(home).not.toContainElement(homeCard);
  expect(station).not.toContainElement(stationCard);
  expect(runtime.record).toHaveBeenCalledTimes(1);
  expect(storedTimers()[0]).toMatchObject({
    elapsedMs: 60000,
    pending: { minutes: 1, recording: { id: 'timer-task-0' } },
  });
  expect(storedTimers()[0].startedAt).toBeUndefined();
  const other = within(station).getByRole('article', { name: '计时 课程任务 1' });
  fireEvent.click(within(other).getByRole('button', { name: '暂停' }));
  expect(within(other).getByRole('button', { name: '继续' })).toBeEnabled();

  await act(async () => pending.resolve({ ...runtime.tasks[0], completed: true }));
  expect(storedTimers().map((timer) => timer.taskId)).toEqual(['task-1']);
  expect(home.querySelectorAll('.task-timer')).toHaveLength(1);
  expect(station.querySelectorAll('.task-timer')).toHaveLength(1);
});

test('a failed last card restores in both views and retries the same persisted recording', async () => {
  const first = deferred();
  const retry = deferred();
  runtime.record.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
  const { home, station } = await setup(1);
  fireEvent.click(within(station).getByRole('button', { name: '完成并记耗时' }));
  expect(home.querySelector('.task-timer')).toBeNull();
  expect(station.querySelector('.task-timer')).toBeNull();
  expect(station.querySelector('.timer-station')).toHaveAttribute('data-empty', 'true');
  const frozen = storedTimers()[0].pending;

  await act(async () => first.reject(new Error('网络失败，请重试')));
  expect(within(home).getByRole('alert')).toHaveTextContent('网络失败，请重试');
  expect(within(station).getByRole('alert')).toHaveTextContent('网络失败，请重试');
  expect(station.querySelector('.timer-station')).toHaveAttribute(
    'data-empty',
    'false',
  );
  expect(storedTimers()[0].pending).toEqual(frozen);

  runtime.tasks = [{ ...runtime.tasks[0], actualDurationMinutes: 90 }];
  vi.mocked(Date.now).mockReturnValue(stamp + 600000);
  fireEvent.click(within(home).getByRole('button', { name: '完成并记耗时' }));
  expect(station.querySelector('.task-timer')).toBeNull();
  expect(runtime.record.mock.calls[1]).toEqual(runtime.record.mock.calls[0]);
  await act(async () => retry.resolve({ ...runtime.tasks[0], completed: true }));
  expect(storedTimers()).toEqual([]);
  expect(home.querySelector('.task-timer')).toBeNull();
  expect(station.querySelector('.task-timer')).toBeNull();
});

test('concurrent completions restore only the failed timer and preserve the successful removal', async () => {
  const first = deferred();
  const second = deferred();
  runtime.record.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { home, station } = await setup();
  fireEvent.click(within(station).getAllByRole('button', { name: '完成并记耗时' })[0]);
  fireEvent.click(within(station).getByRole('button', { name: '完成并记耗时' }));
  expect(station.querySelector('.task-timer')).toBeNull();
  await act(async () => second.resolve({ ...runtime.tasks[1], completed: true }));
  await act(async () => first.reject(new Error('第一个保存失败')));
  expect(storedTimers().map((timer) => timer.taskId)).toEqual(['task-0']);
  expect(within(home).getByRole('article', { name: '计时 课程任务 0' })).toBeVisible();
  expect(within(station).getByRole('alert')).toHaveTextContent('第一个保存失败');
  expect(station.querySelectorAll('.task-timer')).toHaveLength(1);
});
