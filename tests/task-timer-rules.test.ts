/** @fileoverview 验证计时暂停/刷新恢复、回拨后的安全续时、累计耗时与归属不变，以及非法输入边界。 */
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
import { validTimerIntervals } from '@/lib/timer-accounting';
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

const recordedStart = Date.parse('2026-10-21T10:00:00Z');
const minute = 60000;
const expiredRecording: TaskTimer = {
  ...timer,
  mode: 'down',
  targetMs: 5 * minute,
  elapsedMs: 5 * minute,
  startedAt: undefined,
  firstStartedAt: recordedStart,
  intervals: [{ start: recordedStart, end: recordedStart + 5 * minute }],
  timezone: 'UTC',
};

/** 回拨到已结束区间之前或内部时，续时必须等到旧终点后才产生新时段。 */
test.each([-1, 4])(
  'clock rollback to minute %s keeps an extended countdown saveable before time catches up',
  (offset) => {
    const now = recordedStart + offset * minute;
    const extended = extendCountdown(expiredRecording, 5, now);
    expect(extended.startedAt).toBe(recordedStart + 5 * minute);
    expect(extended.targetMs).toBe(10 * minute);
    expect(extended.intervals).toEqual(expiredRecording.intervals);
    expect(timerElapsed(extended, now)).toBe(5 * minute);
    expect(timerElapsed(extended, recordedStart + 5 * minute - 1)).toBe(5 * minute);
    expect(extendCountdown(extended, 5, now)).toBe(extended);

    const restored = normalizeTaskTimers(JSON.parse(JSON.stringify([extended])))[0];
    expect(restored).toEqual(extended);
    const completed = pauseTimer(restored, recordedStart + 5 * minute - 1);
    expect(completed.startedAt).toBeUndefined();
    expect(completed.elapsedMs).toBe(5 * minute);
    expect(completed.intervals).toEqual(expiredRecording.intervals);
    expect(validTimerIntervals(completed.intervals!)).toBe(true);
    expect(normalizeTaskTimers(JSON.parse(JSON.stringify([completed])))[0]).toEqual(
      completed,
    );
  },
);

/** 追上旧终点后只保存新运行段；再次回拨续时仍不得覆盖或重叠历史。 */
test('rollback extensions retain valid intervals after catch-up, completion and repeated extension', () => {
  const extended = extendCountdown(expiredRecording, 5, recordedStart + 4 * minute);
  const completed = pauseTimer(extended, recordedStart + 7 * minute);
  expect(completed.elapsedMs).toBe(7 * minute);
  expect(completed.intervals).toEqual([
    ...expiredRecording.intervals!,
    { start: recordedStart + 5 * minute, end: recordedStart + 7 * minute },
  ]);
  expect(validTimerIntervals(completed.intervals!)).toBe(true);
  expect(normalizeTaskTimers(JSON.parse(JSON.stringify([completed])))[0]).toEqual(
    completed,
  );

  const expiredAgain = pauseTimer(extended, recordedStart + 10 * minute);
  const repeated = extendCountdown(expiredAgain, 5, recordedStart + 9 * minute);
  expect(repeated.startedAt).toBe(recordedStart + 10 * minute);
  expect(repeated.elapsedMs).toBe(10 * minute);
  expect(repeated.targetMs).toBe(15 * minute);
  const restored = normalizeTaskTimers(JSON.parse(JSON.stringify([repeated])))[0];
  expect(restored).toEqual(repeated);
  const final = pauseTimer(restored, recordedStart + 12 * minute);
  expect(final.elapsedMs).toBe(12 * minute);
  expect(final.intervals).toEqual([
    ...expiredRecording.intervals!,
    { start: recordedStart + 5 * minute, end: recordedStart + 10 * minute },
    { start: recordedStart + 10 * minute, end: recordedStart + 12 * minute },
  ]);
  expect(validTimerIntervals(final.intervals!)).toBe(true);
  expect(
    final.intervals!.reduce((sum, interval) => sum + interval.end - interval.start, 0),
  ).toBe(final.elapsedMs);
  expect(normalizeTaskTimers(JSON.parse(JSON.stringify([final])))[0]).toEqual(final);
  expect(final).toMatchObject({
    id: expiredRecording.id,
    taskId: expiredRecording.taskId,
    firstStartedAt: expiredRecording.firstStartedAt,
    entryDate: expiredRecording.entryDate,
  });
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
