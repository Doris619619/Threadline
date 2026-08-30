/** @fileoverview 验证客户端不会把形式正确但真实无效的日期或时间提交给 Supabase。 */

import { describe, expect, it } from 'vitest';
import {
  toDatabaseDate,
  toDatabaseLocalDateTime,
  toDatabaseWallTime,
} from '@/lib/supabase/time-mapper';

describe('Supabase date and time validation', () => {
  it('rejects invalid calendar and wall-clock values', () => {
    expect(() => toDatabaseDate('2026-02-31')).toThrow('Invalid business date');
    expect(() => toDatabaseWallTime('25:80')).toThrow('Invalid wall-clock time');
    expect(() => toDatabaseWallTime('24:30')).toThrow('Invalid wall-clock time');
    expect(() => toDatabaseLocalDateTime('2026-02-31T08:30')).toThrow(
      'Invalid local datetime',
    );
  });
});
