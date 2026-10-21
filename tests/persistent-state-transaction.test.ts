/** @fileoverview 验证计时状态的独占读改写、失败释放及账号隔离；真实跨标签竞争由浏览器 E2E 验证。 */
import { afterEach, expect, test, vi } from 'vitest';
import { commitPersistentState } from '@/lib/persistent-state-transaction';
import {
  normalizeTaskTimers,
  pauseTimer,
  type TaskTimer,
} from '@/features/tasks/timer-rules';

const key = 'threadline.atomic-test:owner';
const stamp = Date.parse('2026-10-21T09:00:00Z');

/** 三张运行卡片各有独立身份，用真实暂停规则产生可保存的运行区间。 */
function timers(): TaskTimer[] {
  return ['a', 'b', 'c'].map((id) => ({
    id,
    taskId: id,
    title: id,
    mode: 'up',
    targetMs: 60000,
    elapsedMs: 0,
    startedAt: stamp,
    firstStartedAt: stamp,
    entryDate: '2026-10-21',
    timezone: 'UTC',
    intervals: [],
  }));
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('three concurrent pauses preserve all cards and their independent elapsed intervals', async () => {
  localStorage.setItem(key, JSON.stringify(timers()));
  await Promise.all(
    ['a', 'b', 'c'].map((id, index) =>
      commitPersistentState<TaskTimer[]>(
        key,
        [],
        (current) =>
          current.map((timer) =>
            timer.id === id ? pauseTimer(timer, stamp + (index + 1) * 60000) : timer,
          ),
        normalizeTaskTimers,
      ),
    ),
  );
  const stored = JSON.parse(localStorage.getItem(key)!) as TaskTimer[];
  expect(stored.map((timer) => timer.elapsedMs)).toEqual([60000, 120000, 180000]);
  expect(stored.every((timer) => timer.startedAt === undefined)).toBe(true);
  expect(normalizeTaskTimers(stored)).toEqual(stored);
});

test('stale completion is rejected inside the lock after a pause without replacing another card', async () => {
  const initial = timers();
  localStorage.setItem(key, JSON.stringify(initial));
  let accepted = false;
  await Promise.all([
    commitPersistentState<TaskTimer[]>(key, [], (current) =>
      current.map((timer) =>
        timer.id === 'a' ? pauseTimer(timer, stamp + 60000) : timer,
      ),
    ),
    commitPersistentState<TaskTimer[]>(key, [], (current) =>
      current.map((timer) => {
        if (timer.id !== 'a' || JSON.stringify(timer) !== JSON.stringify(initial[0]))
          return timer;
        accepted = true;
        return { ...timer, elapsedMs: 999999 };
      }),
    ),
    commitPersistentState<TaskTimer[]>(key, [], (current) =>
      current.filter((timer) => timer.id !== 'b'),
    ),
  ]);
  const stored = JSON.parse(localStorage.getItem(key)!) as TaskTimer[];
  expect(accepted).toBe(false);
  expect(stored.map((timer) => timer.id)).toEqual(['a', 'c']);
  expect(stored[0].elapsedMs).toBe(60000);
});

test('concurrent starts cannot exceed three cards or duplicate a task', async () => {
  const initial = timers();
  localStorage.setItem(key, JSON.stringify(initial.slice(0, 2)));
  let added = 0;
  await Promise.all(
    [initial[2], { ...initial[2], id: 'other-session' }].map((candidate) =>
      commitPersistentState<TaskTimer[]>(key, [], (current) => {
        if (
          current.length >= 3 ||
          current.some((timer) => timer.taskId === candidate.taskId)
        )
          return current;
        added++;
        return [...current, candidate];
      }),
    ),
  );
  expect(added).toBe(1);
  expect(JSON.parse(localStorage.getItem(key)!)).toHaveLength(3);
});

test('a failed write releases the lock, preserves storage, and allows another owner to commit', async () => {
  localStorage.setItem(key, JSON.stringify(['old']));
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  await expect(
    commitPersistentState<string[]>(key, [], () => ['lost']),
  ).rejects.toThrow('quota');
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['old']);
  await Promise.all([
    commitPersistentState<string[]>(key, [], (current) => [...current, 'new']),
    commitPersistentState<string[]>(key + '-other', [], () => ['other']),
  ]);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['old', 'new']);
  expect(JSON.parse(localStorage.getItem(key + '-other')!)).toEqual(['other']);
  write.mockRestore();
});

test('missing browser locks rejects without running the mutation or changing storage', async () => {
  localStorage.setItem(key, '["old"]');
  vi.stubGlobal('navigator', {});
  const update = vi.fn(() => ['unsafe']);
  await expect(commitPersistentState<string[]>(key, [], update)).rejects.toThrow(
    '无法安全同步',
  );
  expect(update).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBe('["old"]');
});
