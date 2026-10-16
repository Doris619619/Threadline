/** @fileoverview 校验总量去重、逐段均分、同任务多设备、跨日夏令时以及原始分钟和旧记录保留。 */
import { expect, test } from 'vitest';
import { allocateTimerEntries, type RecordedTimer } from '@/lib/timer-accounting';
import {
  pauseTimer,
  extendCountdown,
  type TaskTimer,
} from '@/features/tasks/timer-rules';
import { createAnalyticsResult } from '@/lib/analytics';
import { stageTimeBreakdown } from '@/features/stage-plans/time-breakdown';
import { makeTask } from '@/lib/task-factory';

const start = Date.parse('2026-10-15T14:00:00Z');
/** 建立独立任务的真实会话和原账本，分钟仅在边界转毫秒。 */
function fixture(id: string, from: number, to: number): RecordedTimer {
  return {
    id,
    taskId: id,
    taskKey: id,
    projectId: id,
    date: '2026-10-15',
    timezone: 'UTC',
    rawMinutes: to - from,
    ledgerId: id,
    intervals: [{ start: start + from * 60000, end: start + to * 60000 }],
  };
}
/** 同时返回原始余额和分配投影，测试不得先改小原始数据。 */
function account(timers: RecordedTimer[]) {
  const ledger = timers.map((r) => ({
    id: r.ledgerId!,
    taskId: r.taskId,
    projectId: r.projectId,
    date: r.date,
    minutes: r.rawMinutes,
  }));
  return allocateTimerEntries(ledger, timers);
}
test('90/60/30 overlapping minutes allocate 55/25/10 while raw remains 180', () => {
  const rows = account([
    fixture('a', 0, 90),
    fixture('b', 30, 90),
    fixture('c', 60, 90),
  ]);
  expect(rows.filter((r) => r.timing === 'allocated').map((r) => r.minutes)).toEqual([
    55, 25, 10,
  ]);
  expect(rows.reduce((sum, r) => sum + r.rawMinutes!, 0)).toBe(180);
  expect(rows.reduce((sum, r) => sum + r.minutes, 0)).toBe(90);
});
test('same task on two devices has one share; submission order cannot change totals', () => {
  const timers = [
    fixture('a', 0, 60),
    { ...fixture('b', 0, 60), taskKey: 'a' },
    fixture('c', 0, 60),
  ];
  const rows = account(timers);
  expect(rows.filter((r) => r.timing === 'allocated').map((r) => r.minutes)).toEqual([
    30, 30,
  ]);
  expect(account([...timers].reverse()).reduce((s, r) => s + r.minutes, 0)).toBe(60);
});
test('pause and countdown waits never create intervals; extensions retain earlier pieces', () => {
  const timer: TaskTimer = {
    id: 'a',
    taskId: 'a',
    title: 'A',
    mode: 'down',
    targetMs: 60000,
    elapsedMs: 0,
    startedAt: start,
    entryDate: '2026-10-15',
    intervals: [],
    timezone: 'UTC',
  };
  const extended = extendCountdown(timer, 1, start + 300000);
  expect(extended.intervals).toEqual([{ start, end: start + 60000 }]);
  const final = pauseTimer(extended, start + 330000);
  expect(final.intervals).toEqual([
    { start, end: start + 60000 },
    { start: start + 300000, end: start + 330000 },
  ]);
  expect(final.elapsedMs).toBe(90000);
});
test('midnight uses session timezone and DST day length; history remains unlocated', () => {
  const timer = {
    ...fixture('a', 0, 120),
    timezone: 'America/New_York',
    intervals: [
      { start: Date.parse('2026-11-01T03:30Z'), end: Date.parse('2026-11-01T07:30Z') },
    ],
    rawMinutes: 240,
  };
  const rows = account([timer]);
  expect(
    rows.filter((r) => r.timing === 'allocated').map((r) => [r.date, r.minutes]),
  ).toEqual([
    ['2026-10-31', 30],
    ['2026-11-01', 210],
  ]);
  const legacy = {
    id: 'old',
    date: '2026-10-01',
    taskId: 'old',
    projectId: 'p',
    minutes: 80,
  };
  expect(allocateTimerEntries([legacy], [])[0]).toMatchObject({
    ...legacy,
    rawMinutes: 80,
    timing: 'unlocated',
  });
});
test('analytics does not round each third of a minute or add old close snapshot overlap back', () => {
  const rows = account([fixture('a', 0, 1), fixture('b', 0, 1), fixture('c', 0, 1)]);
  const result = createAnalyticsResult({
    tasks: [],
    projects: [],
    dailyByDate: {},
    dailyHistory: [],
    taskTimeEntries: rows,
    closeRecords: [
      {
        id: 'close',
        date: '2026-10-15',
        closedAt: '',
        projectMinutes: { a: 1, b: 1, c: 1 },
      },
    ],
  });
  expect(result.totalActualMinutes).toBeCloseTo(1);
});

test('stage filtering preserves globally allocated shares and historical project identity', () => {
  const timers = [fixture('a', 0, 90), fixture('b', 30, 90), fixture('c', 60, 90)];
  const rows = account(timers);
  const tasks = timers.map((timer, index) => ({
    ...makeTask(timer.date, timer.taskId!, 'new-project', timer.taskKey),
    stagePlanId: index === 0 ? 'stage-a' : 'stage-b',
  }));
  const breakdown = stageTimeBreakdown(tasks, [], 'stage-a', 'actual', undefined, rows);
  expect(breakdown.total).toBe(55);
  expect(breakdown.groups[0].id).toBe('a');
  expect(breakdown.groups.some((group) => group.id === 'new-project')).toBe(false);
});

test('old close-only history is retained while new allocated snapshots never inflate recomputed totals', () => {
  const rows = account([fixture('a', 0, 60), fixture('b', 0, 60)]);
  const base = {
    tasks: [],
    projects: [],
    dailyByDate: {},
    dailyHistory: [],
    taskTimeEntries: rows,
  };
  const old = createAnalyticsResult({
    ...base,
    closeRecords: [
      {
        id: 'old',
        date: '2026-10-15',
        closedAt: '',
        projectMinutes: { a: 60, b: 60, legacy: 20 },
      },
    ],
  });
  expect(old.totalActualMinutes).toBe(80);
  const snapshot = createAnalyticsResult({
    ...base,
    closeRecords: [
      {
        id: 'new',
        date: '2026-10-15',
        closedAt: '',
        timeAccountingVersion: 1,
        projectMinutes: { a: 60 },
      },
    ],
  });
  expect(snapshot.totalActualMinutes).toBe(60);
});
