/** @fileoverview 习惯规则回归：跨午夜、账号时区、夏令时、分钟边界和独立统计分母。 */
import { describe, expect, it } from 'vitest';
import {
  emptyHabitData,
  applyLocalHabitRequest,
  configureLocalHabits,
} from '@/features/habits/habit-local-repository';
import {
  habitBusinessDate,
  habitLocalTime,
  resolveHabitLocalTime,
  validateHabitRules,
  formatHabitMinutes,
  habitAddDays,
} from '@/features/habits/habit-time';
import {
  habitGrade,
  habitRegularity,
  summarizeHabits,
  habitRuleForDate,
} from '@/features/habits/habit-statistics';
import { DEFAULT_RULES, type HabitRequest } from '@/features/habits/habit-types';

const now = '2026-09-12T10:00:00Z';
it('validates persisted rules without interpreting their metadata as boundaries', () => {
  expect(() => validateHabitRules(emptyHabitData('UTC').rules[0])).not.toThrow();
  const initial = emptyHabitData('UTC');
  const first = configureLocalHabits(
    initial,
    'UTC',
    { ...DEFAULT_RULES, wake_target: 420 },
    0,
    'first',
    now,
  );
  const latest = configureLocalHabits(
    first,
    'UTC',
    { ...DEFAULT_RULES, wake_target: 430 },
    1,
    'second',
    now,
  );
  expect(habitRuleForDate(latest.rules, '2026-09-13').wake_target).toBe(430);
});
/** 生成可重复的自动打卡命令，绝不调用真实云端。 */
function request(
  instant: string,
  kind: 'sleep' | 'wake' | 'efficiency' = 'sleep',
): HabitRequest {
  return {
    requestId: crypto.randomUUID(),
    settingsVersion: 0,
    timezone: 'Asia/Shanghai',
    changes: [
      {
        mode: 'record',
        kind,
        occurred_at: instant,
        ...(kind === 'efficiency' ? { efficiency: 'good' as const } : {}),
      },
    ],
  };
}
describe('habit dates and grades', () => {
  it.each([
    ['2026-09-11T23:20:59.999+08:00', '达标'],
    ['2026-09-11T23:21:00+08:00', '稍晚'],
    ['2026-09-11T23:59:00+08:00', '稍晚'],
    ['2026-09-12T00:00:00+08:00', '较晚'],
    ['2026-09-12T00:30:59+08:00', '较晚'],
    ['2026-09-12T00:31:00+08:00', '很晚'],
  ])('grades %s as %s without rounding away the raw instant', (instant, expected) => {
    const data = applyLocalHabitRequest(
      emptyHabitData('Asia/Shanghai'),
      request(instant),
      now,
    );
    expect(data.entries[0].occurred_at).toBe(instant);
    expect(data.entries[0].business_date).toBe('2026-09-11');
    expect(habitGrade(data.entries[0], data.rules)).toBe(expected);
  });
  it.each([
    ['2026-09-12T03:59:59+08:00', 'sleep', '2026-09-11'],
    ['2026-09-12T04:00:00+08:00', 'sleep', '2026-09-12'],
    ['2026-09-12T03:00:00+08:00', 'wake', '2026-09-12'],
    ['2026-09-12T01:00:00+08:00', 'efficiency', '2026-09-11'],
    ['2026-01-01T00:20:00+08:00', 'sleep', '2025-12-31'],
    ['2024-03-01T00:20:00+08:00', 'sleep', '2024-02-29'],
  ] as const)('attributes %s / %s to %s', (instant, kind, expected) =>
    expect(habitBusinessDate(instant, 'Asia/Shanghai', kind)).toBe(expected),
  );
  it('uses the account zone and rejects unknown or nonexistent wall times', () => {
    expect(habitBusinessDate('2026-09-12T02:00:00Z', 'America/New_York', 'wake')).toBe(
      '2026-09-11',
    );
    expect(habitBusinessDate('2026-09-12T02:00:00Z', 'Asia/Shanghai', 'wake')).toBe(
      '2026-09-12',
    );
    expect(() => habitLocalTime(now, 'Bad/Zone')).toThrow('时区');
    expect(() => resolveHabitLocalTime('2026-03-08T02:30', 'America/New_York')).toThrow(
      '不存在',
    );
    expect(() => resolveHabitLocalTime('2026-11-01T01:30', 'America/New_York')).toThrow(
      '两次',
    );
    const first = resolveHabitLocalTime(
      '2026-11-01T01:30',
      'America/New_York',
      'earlier',
    );
    const second = resolveHabitLocalTime(
      '2026-11-01T01:30',
      'America/New_York',
      'later',
    );
    expect(Date.parse(second) - Date.parse(first)).toBe(3600000);
  });
  it('validates independent boundaries and keeps goal versions for history', () => {
    const data = applyLocalHabitRequest(
      emptyHabitData('Asia/Shanghai'),
      request('2026-09-11T23:20:00+08:00'),
      now,
    );
    expect(() => validateHabitRules({ ...DEFAULT_RULES, sleep_late: 1300 })).toThrow();
    expect(() =>
      validateHabitRules({ ...DEFAULT_RULES, sleep_very_late: 1680 }),
    ).toThrow();
    expect(() => validateHabitRules({ ...DEFAULT_RULES, wake_target: 1440 })).toThrow();
    const configured = configureLocalHabits(
      data,
      'America/New_York',
      { ...DEFAULT_RULES, sleep_target: 1380, sleep_late: 1450, sleep_very_late: 1500 },
      0,
      crypto.randomUUID(),
      now,
    );
    expect(habitRuleForDate(configured.rules, '2026-09-13').sleep_late).toBe(1450);
    expect(habitGrade(configured.entries[0], configured.rules)).toBe('达标');
    expect(configured.entries[0].timezone).toBe('Asia/Shanghai');
  });
});
describe('habit statistics', () => {
  it('averages 23:50 and next-day 00:20 as next-day 00:05, with independent denominators', () => {
    let data = emptyHabitData('Asia/Shanghai');
    for (const command of [
      request('2026-09-10T23:50:00+08:00'),
      request('2026-09-12T00:20:00+08:00'),
      request('2026-09-11T06:49:00+08:00', 'wake'),
    ])
      data = applyLocalHabitRequest(data, command, now);
    const summary = summarizeHabits(
      data.entries,
      data.rules,
      '2026-09-07',
      '2026-09-13',
      '2026-09-12',
    );
    expect(formatHabitMinutes(summary.sleep.average!)).toBe('次日 00:05');
    expect(summary.sleep).toMatchObject({ count: 2, achieved: 0, rate: 0 });
    expect(summary.wake).toMatchObject({ count: 1, achieved: 1, rate: 100 });
    expect(
      summarizeHabits([], data.rules, '2026-09-07', '2026-09-13', '2026-09-12').sleep
        .rate,
    ).toBeNull();
  });
  it('excludes deleted and future records, retains mixed-zone signal', () => {
    const data = applyLocalHabitRequest(
      emptyHabitData('Asia/Shanghai'),
      request('2026-09-11T06:49:00+08:00', 'wake'),
      now,
    );
    const row = data.entries[0];
    const summary = summarizeHabits(
      [
        row,
        { ...row, id: '2', business_date: '2026-09-12', timezone: 'UTC' },
        { ...row, id: '3', business_date: '2026-09-13' },
        { ...row, id: '4', deleted_at: now },
      ],
      data.rules,
      '2026-09-07',
      '2026-09-13',
      '2026-09-12',
    );
    expect(summary.wake.count).toBe(2);
    expect(summary.mixedTimezones).toBe(true);
  });
  it('requires two sufficiently sampled complete windows and compares wall-clock differences', () => {
    let data = emptyHabitData('Asia/Shanghai');
    expect(habitRegularity([], data.rules, '2026-09-12', 'sleep')).toContain(
      '至少 7 天',
    );
    for (let day = 1; day <= 28; day++) {
      const date = habitAddDays('2026-09-12', -day);
      data = applyLocalHabitRequest(
        data,
        request(`${date}T${day <= 14 ? '23:40' : '23:20'}:00+08:00`),
        now,
      );
    }
    expect(habitRegularity(data.entries, data.rules, '2026-09-12', 'sleep')).toContain(
      '晚 20 分钟',
    );
  });
});
