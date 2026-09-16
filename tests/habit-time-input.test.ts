/** @fileoverview 整段手填时间的跨午夜归属、输入校验及账号时区转换回归。 */
import { expect, it } from 'vitest';
import {
  habitActualTimeLabel,
  habitLocalForClock,
  resolveHabitLocalTime,
} from '@/features/habits/habit-time';

it.each([
  ['23:48', '2026-09-15T23:48', '2026-09-15T15:48:00Z'],
  ['00:12', '2026-09-16T00:12', '2026-09-15T16:12:00Z'],
  ['01:40', '2026-09-16T01:40', '2026-09-15T17:40:00Z'],
  ['03:59', '2026-09-16T03:59', '2026-09-15T19:59:00Z'],
  ['04:00', '2026-09-15T04:00', '2026-09-14T20:00:00Z'],
])('interprets %s for the selected night in China', (input, local, instant) => {
  expect(habitLocalForClock('2026-09-15', 'sleep', input)).toBe(local);
  expect(resolveHabitLocalTime(local, 'Asia/Shanghai')).toBe(instant);
});
it('handles pasted digits, full-width colon, month/year boundaries and wake dates', () => {
  expect(habitLocalForClock('2026-12-31', 'sleep', ' 0040 ')).toBe('2027-01-01T00:40');
  expect(habitLocalForClock('2024-02-29', 'sleep', '1：40')).toBe('2024-03-01T01:40');
  expect(habitLocalForClock('2026-09-15', 'wake', '01:40')).toBe('2026-09-15T01:40');
  expect(habitActualTimeLabel('2026-09-16T00:12')).toBe('9月16日凌晨 00:12');
  expect(habitActualTimeLabel('2026-09-15T23:48')).toBe('9月15日晚 23:48');
});
it.each(['', '2', '23:', '24:00', '12:60', '1:4', '-1:40', 'hello'])(
  'rejects incomplete or invalid input %s',
  (input) => {
    expect(() => habitLocalForClock('2026-09-15', 'sleep', input)).toThrow(
      '请输入有效时间',
    );
  },
);
