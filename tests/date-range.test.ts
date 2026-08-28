/** @fileoverview 验证周一范围、月历网格和前序比较周期都使用 LocalDateKey。 */

import { describe, expect, it } from 'vitest';
import {
  getMonthGrid,
  getPreviousEqualLengthRange,
  getWeekRange,
  iterateLocalDateRange,
} from '@/lib/date-range';

describe('date range helpers', () => {
  it('starts weeks on Monday', () => {
    expect(getWeekRange('2026-08-28')).toEqual({
      start: '2026-08-24',
      end: '2026-08-30',
    });
  });

  it('pads the month grid to complete Monday-first weeks', () => {
    const grid = getMonthGrid('2026-08-20');
    expect(grid[0]).toBe('2026-07-27');
    expect(grid.at(-1)).toBe('2026-09-06');
    expect(grid).toHaveLength(42);
  });

  it('creates an adjacent equal-length comparison period', () => {
    const current = { start: '2026-08-24' as const, end: '2026-08-30' as const };
    expect(getPreviousEqualLengthRange(current)).toEqual({
      start: '2026-08-17',
      end: '2026-08-23',
    });
    expect(iterateLocalDateRange(current)).toHaveLength(7);
  });
});
