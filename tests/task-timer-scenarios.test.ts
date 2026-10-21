/** @fileoverview 验证三个计时器交错暂停、倒计时续时、缓存恢复与不同保存顺序下的精确时段和总量守恒。 */
import { expect, test } from 'vitest';
import {
  extendCountdown,
  normalizeTaskTimers,
  pauseTimer,
  timerElapsed,
  type TaskTimer,
} from '@/features/tasks/timer-rules';
import {
  allocateTimerEntries,
  validTimerIntervals,
  type RecordedTimer,
} from '@/lib/timer-accounting';

const origin = Date.parse('2026-10-21T09:00:00Z');

/** 将场景中的相对分钟换算为同一 UTC 起点上的绝对毫秒。 */
function at(minutes: number) {
  return origin + minutes * 60000;
}

/** 创建带完整时段信息的新计时会话；倒计时目标与正计时上限独立指定。 */
function startTimer(
  id: string,
  minutes: number,
  mode: TaskTimer['mode'] = 'up',
  targetMinutes = 60,
): TaskTimer {
  return {
    id,
    taskId: id,
    title: id,
    mode,
    targetMs: targetMinutes * 60000,
    elapsedMs: 0,
    startedAt: at(minutes),
    firstStartedAt: at(minutes),
    entryDate: '2026-10-21',
    intervals: [],
    timezone: 'UTC',
  };
}

/** 模拟刷新或关闭重开后的 JSON 持久化恢复，不为暂停时段补造运行区间。 */
function restore(timers: TaskTimer[]) {
  return normalizeTaskTimers(JSON.parse(JSON.stringify(timers)) as TaskTimer[]);
}

/** 将已冻结会话转换成保存后的账本输入，原始分钟按真实提交规则四舍五入。 */
function record(timer: TaskTimer): RecordedTimer {
  return {
    id: timer.id,
    taskId: timer.taskId,
    taskKey: timer.taskId,
    projectId: timer.taskId,
    ledgerId: timer.id,
    date: timer.entryDate,
    rawMinutes: Math.round(timer.elapsedMs / 60000),
    intervals: timer.intervals!,
    timezone: timer.timezone!,
  };
}

/** 按同一账号的完整已保存记录计算分摊，保留每条记录的原始账本金额。 */
function allocate(timers: TaskTimer[]) {
  const records = timers.map(record);
  return allocateTimerEntries(
    records.map((timer) => ({
      id: timer.ledgerId!,
      taskId: timer.taskId,
      projectId: timer.projectId,
      date: timer.date,
      minutes: timer.rawMinutes,
    })),
    records,
  );
}

/** 构造含五分钟全部暂停空档的三路交错运行；B 到时后的十五分钟等待不计时。 */
function interleavedTimers() {
  let a = startTimer('a', 0);
  let b = startTimer('b', 10, 'down', 20);
  let c = startTimer('c', 15);
  a = pauseTimer(a, at(20));
  c = pauseTimer(c, at(25));
  b = pauseTimer(b, at(30));
  [a, b, c] = restore([a, b, c]);
  expect([a, b, c].map((timer) => timerElapsed(timer, at(35)) / 60000)).toEqual([
    20, 20, 10,
  ]);
  a = { ...a, startedAt: at(35) };
  c = { ...c, startedAt: at(40) };
  [a, b, c] = restore([a, b, c]);
  b = extendCountdown(b, 10, at(45));
  return [a, b, c].map((timer) => pauseTimer(timer, at(60)));
}

test('three interleaved timers retain exact intervals through pauses, countdown waits and JSON recovery', () => {
  const timers = restore(interleavedTimers());
  expect(timers.map((timer) => timer.elapsedMs / 60000)).toEqual([45, 30, 30]);
  expect(
    timers.map((timer) =>
      timer.intervals!.map((part) => [
        (part.start - origin) / 60000,
        (part.end - origin) / 60000,
      ]),
    ),
  ).toEqual([
    [
      [0, 20],
      [35, 60],
    ],
    [
      [10, 30],
      [45, 55],
    ],
    [
      [15, 25],
      [40, 60],
    ],
  ]);
  for (const timer of timers) {
    expect(validTimerIntervals(timer.intervals!)).toBe(true);
    expect(timer.intervals!.reduce((sum, part) => sum + part.end - part.start, 0)).toBe(
      timer.elapsedMs,
    );
    expect(timerElapsed(timer, at(240))).toBe(timer.elapsedMs);
    expect(timer.entryDate).toBe('2026-10-21');
    expect(timer.timezone).toBe('UTC');
  }
  expect(timers.map((timer) => timer.firstStartedAt)).toEqual([at(0), at(10), at(15)]);
});

test.each([
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
])(
  'saving interleaved timers in order %i/%i/%i preserves 55 union minutes',
  (a, b, c) => {
    const timers = interleavedTimers();
    const order = [a, b, c].map((index) => timers[index]);
    for (let saved = 1; saved <= 3; saved++) {
      const subset = order.slice(0, saved);
      const rows = allocate(restore(subset));
      expect(rows.every((row) => row.minutes >= 0)).toBe(true);
      expect(rows.reduce((sum, row) => sum + row.rawMinutes!, 0)).toBe(
        subset.reduce((sum, timer) => sum + timer.elapsedMs / 60000, 0),
      );
    }
    const rows = allocate(restore(order));
    const shares = new Map(
      rows
        .filter((row) => row.timing === 'allocated')
        .map((row) => [row.taskId, row.minutes]),
    );
    expect(shares.get('a')).toBeCloseTo(27.5, 10);
    expect(shares.get('b')).toBeCloseTo(15, 10);
    expect(shares.get('c')).toBeCloseTo(12.5, 10);
    expect(rows.reduce((sum, row) => sum + row.minutes, 0)).toBeCloseTo(55, 10);
    expect(rows.reduce((sum, row) => sum + row.rawMinutes!, 0)).toBe(105);
  },
);

test('three sub-minute timers preserve fractional allocation without rounding raw zeros back into the total', () => {
  const timers = ['a', 'b', 'c'].map((id) => pauseTimer(startTimer(id, 0), at(1 / 3)));
  const rows = allocate(restore(timers));
  const shares = rows.filter((row) => row.timing === 'allocated');
  expect(rows.reduce((sum, row) => sum + row.rawMinutes!, 0)).toBe(0);
  expect(shares).toHaveLength(3);
  for (const row of shares) expect(row.minutes).toBeCloseTo(1 / 9, 10);
  expect(rows.reduce((sum, row) => sum + row.minutes, 0)).toBeCloseTo(1 / 3, 10);
});
