/** @fileoverview 验证 Supabase date/time mapper 不把业务墙钟隐式转换为 UTC。 */

import { describe, expect, it } from 'vitest';
import {
  fromDatabaseInstant,
  fromDatabaseLocalDateTime,
  fromDatabaseWallTime,
  toDatabaseDate,
  toDatabaseLocalDateTime,
  toDatabaseWallTime,
} from '@/lib/supabase/time-mapper';

describe('Supabase time mappers', () => {
  it('keeps business dates and local wall clocks timezone-free', () => {
    expect(toDatabaseDate('2026-08-30')).toBe('2026-08-30');
    expect(toDatabaseWallTime('08:35')).toBe('08:35:00');
    expect(fromDatabaseWallTime('08:35:00')).toBe('08:35');
    expect(toDatabaseLocalDateTime('2026-08-30T21:15')).toBe('2026-08-30T21:15:00');
    expect(fromDatabaseLocalDateTime('2026-08-30 21:15:00')).toBe('2026-08-30T21:15');
  });

  it('normalizes only audit timestamptz fields as absolute instants', () => {
    expect(fromDatabaseInstant('2026-08-30T21:15:00+08:00')).toBe(
      '2026-08-30T13:15:00.000Z',
    );
  });
});
