/** @fileoverview 账号时区跨午夜与纯日期运算回归，确保电脑时区不参与已设置账号的业务判断。 */
import { afterEach, expect, it } from 'vitest';
import { accountClockParts, setAccountTimezone } from '@/lib/account-clock';
import {
  getLocalDateKey,
  getLocalDateKeyFromTimestamp,
  addLocalDateDays,
} from '@/lib/local-date';
import { getMonthRange, getWeekRange } from '@/lib/date-range';
import { habitBusinessDate, habitLocalTime } from '@/features/habits/habit-time';

afterEach(() => setAccountTimezone(undefined));
it('uses the selected China date and time for the same instant across devices', () => {
  setAccountTimezone('Asia/Shanghai');
  const now = new Date('2026-09-12T17:10:12.345Z');
  expect(getLocalDateKey(now)).toBe('2026-09-13');
  expect(getLocalDateKeyFromTimestamp(now.toISOString())).toBe('2026-09-13');
  expect(accountClockParts(now)).toEqual({
    date: '2026-09-13',
    time: '01:10:12',
    minutes: 70,
  });
  expect(habitBusinessDate(now.toISOString(), 'Asia/Shanghai', 'sleep')).toBe(
    '2026-09-12',
  );
  expect(habitBusinessDate(now.toISOString(), 'Asia/Shanghai', 'wake')).toBe(
    '2026-09-13',
  );
  expect(habitLocalTime(now.toISOString(), 'Asia/Shanghai')).toContain(
    '2026-09-13T01:10:12.345',
  );
});
it('does not shift date-only calendar ranges when the timezone is changed', () => {
  for (const zone of ['Asia/Shanghai', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    setAccountTimezone(zone);
    expect(getMonthRange('2026-09-12')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
    expect(getWeekRange('2026-09-12')).toEqual({
      start: '2026-09-07',
      end: '2026-09-13',
    });
    expect(addLocalDateDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addLocalDateDays('2026-03-08', 1)).toBe('2026-03-09');
  }
});
it('follows actual DST offsets and updates the clock without changing the instant', () => {
  setAccountTimezone('America/New_York');
  expect(accountClockParts(new Date('2026-03-08T06:59:00Z')).time).toBe('01:59:00');
  expect(accountClockParts(new Date('2026-03-08T07:00:00Z')).time).toBe('03:00:00');
  expect(getLocalDateKey(new Date('2026-09-12T01:00:00Z'))).toBe('2026-09-11');
  setAccountTimezone('Asia/Shanghai');
  expect(getLocalDateKey(new Date('2026-09-12T01:00:00Z'))).toBe('2026-09-12');
});
