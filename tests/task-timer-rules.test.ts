/** @fileoverview 验证并行计时的暂停/刷新恢复、倒计时到时和时钟回拨边界。 */
import { expect, test } from 'vitest';
import {
  normalizeTaskTimers,
  pauseTimer,
  timerClock,
  timerElapsed,
  type TaskTimer,
} from '@/features/tasks/timer-rules';
const timer: TaskTimer = {
  id: 'a',
  taskId: 't',
  title: 'A',
  mode: 'up',
  elapsedMs: 2000,
  startedAt: 10000,
  firstStartedAt: 5000,
  targetMs: 60000,
  entryDate: '2026-10-03',
};
test('absolute anchors survive background suspension and refresh; pause excludes idle time', () => {
  expect(timerElapsed(timer, 45000)).toBe(37000);
  const paused = pauseTimer(timer, 45000);
  expect(paused.firstStartedAt).toBe(5000);
  expect(timerElapsed(paused, 900000)).toBe(37000);
  expect(timerElapsed({ ...paused, startedAt: 900000 }, 910000)).toBe(47000);
  expect(timerElapsed(timer, 0)).toBe(2000);
});
test('countdown caps at zero and multiple timers retain independent anchors', () => {
  expect(timerElapsed({ ...timer, mode: 'down' }, 900000)).toBe(60000);
  expect(
    [
      timer,
      { ...timer, elapsedMs: 10000, startedAt: undefined },
      { ...timer, mode: 'down' as const },
    ].map((t) => timerElapsed(t, 80000)),
  ).toEqual([72000, 10000, 60000]);
  expect(timerClock(0)).toBe('00:00:00');
  expect(timerClock(20000)).toBe('00:00:20');
  expect(timerClock(3661000)).toBe('01:01:01');
  expect(timerClock(248601000)).toBe('69:03:21');
  expect(
    normalizeTaskTimers([timer, { ...timer, elapsedMs: NaN }, timer, timer, timer]),
  ).toHaveLength(3);
});
test('restores a known legacy first start but never invents a paused timer history', () => {
  const legacy = { ...timer, firstStartedAt: undefined };
  expect(normalizeTaskTimers([{ ...legacy, elapsedMs: 0 }])[0].firstStartedAt).toBe(
    legacy.startedAt,
  );
  expect(normalizeTaskTimers([legacy])[0].firstStartedAt).toBeUndefined();
  expect(
    normalizeTaskTimers([{ ...legacy, elapsedMs: 0, startedAt: undefined }])[0]
      .firstStartedAt,
  ).toBeUndefined();
  expect(normalizeTaskTimers([timer])[0].firstStartedAt).toBe(5000);
});
