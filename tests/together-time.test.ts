/** @fileoverview 验证两个账号不同时区、夏令时与首次提交口径，防止设备时区影响业务判断。 */
import { describe, expect, it } from 'vitest';
import {
  deadlineInstant,
  defaultDeadline,
  localDeadline,
  isLate,
  spaceTime,
  shortSpaceTime,
  invalidSpaceTime,
  validSpaceTime,
} from '@/features/together/time';
import { togetherCopy, address, memberName } from '@/features/together/copy';
import type { Flag, Room } from '@/features/together/types';
describe('two-person time and copy', () => {
  it.each([
    'infinity',
    '-infinity',
    'invalid',
    '',
    '1899-12-31T23:59:59Z',
    '+010000-01-01T00:00:00Z',
  ])('contains an invalid stored instant: %s', (instant) => {
    expect(validSpaceTime(instant)).toBe(false);
    expect(spaceTime(instant, 'Asia/Shanghai')).toBe(invalidSpaceTime);
    expect(shortSpaceTime(instant, 'America/New_York')).toBe(invalidSpaceTime);
    expect(localDeadline(instant, 'Asia/Shanghai')).toBe('');
  });
  it('accepts historical deadlines and rejects input beyond the database bounds', () => {
    expect(deadlineInstant('2000-01-01T12:00', 'UTC')).toBe('2000-01-01T12:00:00Z');
    expect(() => deadlineInstant('1899-12-31T23:59', 'UTC')).toThrow('1900');
    expect(() => deadlineInstant('+010000-01-01T00:00', 'UTC')).toThrow('9999');
  });
  it('shows one instant in each viewer timezone', () => {
    expect(localDeadline('2026-09-28T14:00:00Z', 'Asia/Shanghai')).toBe(
      '2026-09-28T22:00',
    );
    expect(localDeadline('2026-09-28T14:00:00Z', 'America/New_York')).toBe(
      '2026-09-28T10:00',
    );
    expect(deadlineInstant('2026-09-28T22:00', 'Asia/Shanghai')).toBe(
      '2026-09-28T14:00:00Z',
    );
    expect(spaceTime('2026-09-28T14:00:00Z', 'America/New_York')).toContain('10:00');
  });
  it('defaults to the account local day across midnight', () => {
    const now = new Date('2026-09-28T01:00:00Z');
    expect(defaultDeadline('Asia/Shanghai', now)).toBe('2026-09-28T23:59');
    expect(defaultDeadline('America/New_York', now)).toBe('2026-09-27T23:59');
  });
  it('rejects nonexistent and repeated DST wall times', () => {
    expect(() => deadlineInstant('2026-03-08T02:30', 'America/New_York')).toThrow(
      '夏令时',
    );
    expect(() => deadlineInstant('2026-11-01T01:30', 'America/New_York')).toThrow(
      '夏令时',
    );
    expect(deadlineInstant('2026-11-01T03:30', 'America/New_York')).toBe(
      '2026-11-01T08:30:00Z',
    );
  });
  it('late approval and supplements do not change on-time submission', () => {
    const flag = {
      deadline: '2026-09-28T14:00:00Z',
      first_submitted_at: '2026-09-28T13:59:00Z',
    } as Flag;
    expect(isLate(flag, Date.parse('2026-10-01T00:00:00Z'))).toBe(false);
    expect(isLate({ ...flag, first_submitted_at: '2026-09-28T14:01:00Z' })).toBe(true);
    expect(
      isLate({ ...flag, first_submitted_at: null }, Date.parse('2026-09-28T14:00:00Z')),
    ).toBe(false);
  });
  it('uses approved couple copy and shared nicknames', () => {
    expect(togetherCopy.couple.overdue).toBe(
      '晚一点没关系，我还在等你把它做好给我看。',
    );
    expect(address(togetherCopy.couple.cheered, '小熊')).toBe(
      '小熊来给你抱抱啦：慢慢做，我陪你。',
    );
    expect(
      memberName({ user_a: 'a', name_a: '小桃', nickname_a: null } as Room, 'a'),
    ).toBe('小桃');
  });
});
