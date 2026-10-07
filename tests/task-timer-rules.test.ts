/** @fileoverview 验证计时暂停/刷新恢复、倒计时续时的累计耗时与归属不变，以及非法输入边界。 */
import { expect, test } from 'vitest';
import {
  normalizeTaskTimers,
  pauseTimer,
  extendCountdown,
  timerClock,
  timerElapsed,
  type TaskTimer,
} from '@/features/tasks/timer-rules';
import { makeTask } from '@/lib/task-factory';
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

test('extends an expired background countdown without counting the wait before extension', () => {
  const expired: TaskTimer = { ...timer, mode: 'down' };
  const extended = extendCountdown(expired, 5, 900000);
  expect(extended).toEqual({
    ...expired,
    elapsedMs: 60000,
    targetMs: 360000,
    startedAt: 900000,
  });
  expect(timerElapsed(extended, 900000)).toBe(60000);
  expect(timerElapsed(extended, 930000)).toBe(90000);
  expect(extended.targetMs - timerElapsed(extended, 930000)).toBe(270000);
  expect(expired).toEqual({ ...timer, mode: 'down' });
});

test('extends at the exact deadline and from a paused expired countdown', () => {
  const countdown: TaskTimer = { ...timer, mode: 'down' };
  const atDeadline = extendCountdown(countdown, 1, 68000);
  expect(atDeadline.elapsedMs).toBe(60000);
  expect(atDeadline.targetMs).toBe(120000);
  expect(atDeadline.startedAt).toBe(68000);
  const paused = pauseTimer(countdown, 68000);
  const extended = extendCountdown(paused, 1, 900000);
  expect(extended.elapsedMs).toBe(60000);
  expect(extended.targetMs).toBe(120000);
  expect(extended.startedAt).toBe(900000);
});

test('retains cumulative used time and original task identity across repeated extensions', () => {
  const initial: TaskTimer = { ...timer, mode: 'down' };
  const first = extendCountdown(initial, 10, 900000);
  // 旧页面仍显示到时时，必须用最新已恢复对象拒绝重复续时。
  expect(extendCountdown(first, 5, 900000)).toBe(first);
  const second = extendCountdown(first, 5, 1800000);
  const third = extendCountdown(pauseTimer(second, 3000000), 1, 6000000);
  expect(first.elapsedMs).toBe(60000);
  expect(second.elapsedMs).toBe(660000);
  expect(third.elapsedMs).toBe(960000);
  expect(third.targetMs).toBe(1020000);
  expect(timerElapsed(third, 6030000)).toBe(990000);
  expect(third).toMatchObject({
    id: initial.id,
    taskId: initial.taskId,
    title: initial.title,
    firstStartedAt: initial.firstStartedAt,
    entryDate: initial.entryDate,
    startedAt: 6000000,
  });
  expect(
    extendCountdown({ ...initial, firstStartedAt: undefined }, 1, 900000)
      .firstStartedAt,
  ).toBeUndefined();
});

test('keeps count-up, unfinished and pending countdown timers unchanged', () => {
  const countdown: TaskTimer = { ...timer, mode: 'down' };
  const paused = pauseTimer(countdown, 20000);
  const pending: TaskTimer = {
    ...countdown,
    pending: {
      original: makeTask(timer.entryDate, timer.taskId, 'project', timer.title),
      minutes: 1,
    },
  };
  expect(extendCountdown(timer, 5, 900000)).toBe(timer);
  expect(extendCountdown(countdown, 5, 67999)).toBe(countdown);
  expect(extendCountdown(countdown, 5, 0)).toBe(countdown);
  expect(extendCountdown(paused, 5, 900000)).toBe(paused);
  expect(extendCountdown(pending, 5, 900000)).toBe(pending);
});

test.each([NaN, Infinity, -Infinity, -1, 0, 0.5, 1441, Number.MAX_SAFE_INTEGER])(
  'keeps an expired countdown unchanged for invalid extension minutes %s',
  (minutes) => {
    const expired: TaskTimer = { ...timer, mode: 'down' };
    expect(extendCountdown(expired, minutes, 900000)).toBe(expired);
  },
);

test.each([1, 1440])(
  'accepts the minute boundary %s without losing elapsed time',
  (minutes) => {
    const expired: TaskTimer = { ...timer, mode: 'down' };
    const extended = extendCountdown(expired, minutes, 900000);
    expect(extended.elapsedMs).toBe(60000);
    expect(extended.targetMs).toBe(60000 + minutes * 60000);
  },
);

test.each([NaN, Infinity, -Infinity])(
  'keeps an expired countdown unchanged for an invalid current timestamp %s',
  (now) => {
    const expired: TaskTimer = { ...timer, mode: 'down' };
    expect(extendCountdown(expired, 5, now)).toBe(expired);
  },
);
