/** @fileoverview 验证生理期跨日边界、冲突保护和事实统计，不依赖页面实现。 */
import { describe, expect, it } from 'vitest';
import {
  periodDays,
  summarizePeriods,
  validatePeriod,
  type PeriodRecord,
} from '@/features/rhythm/period-rules';

const record: PeriodRecord = {
  id: 'one',
  startDate: '2026-08-29',
  endDate: '2026-09-02',
  createdAt: '',
  updatedAt: '',
};
describe('period date rules', () => {
  it('counts inclusive days across month, year and leap-day boundaries', () => {
    expect(periodDays('2026-09-01', '2026-09-01')).toBe(1);
    expect(periodDays(record.startDate, record.endDate!)).toBe(5);
    expect(periodDays('2025-12-30', '2026-01-02')).toBe(4);
    expect(periodDays('2024-02-28', '2024-03-01')).toBe(3);
  });
  it.each([
    ['2026-02-30', undefined],
    ['2026-09-06', undefined],
    ['2026-09-01', '2026-09-06'],
    ['2026-09-02', '2026-09-01'],
    ['2026-09-01', '2026-09-03'],
  ])(
    'rejects invalid, future, reversed or overlapping dates %s / %s',
    (startDate, endDate) => {
      expect(() =>
        validatePeriod(
          { id: 'two', startDate: startDate!, endDate },
          [record],
          '2026-09-05',
        ),
      ).toThrow();
    },
  );
  it('allows editing the same record and adjacent records but only one open record', () => {
    expect(() => validatePeriod(record, [record], '2026-09-05')).not.toThrow();
    expect(() =>
      validatePeriod({ id: 'two', startDate: '2026-09-03' }, [record], '2026-09-05'),
    ).not.toThrow();
    expect(() =>
      validatePeriod(
        { id: 'two', startDate: '2026-09-03' },
        [{ ...record, endDate: undefined }],
        '2026-09-05',
      ),
    ).toThrow(/重叠/);
    expect(() =>
      validatePeriod(
        { ...record, id: 'two' },
        [{ ...record, deletedAt: 'deleted' }],
        '2026-09-05',
      ),
    ).not.toThrow();
  });
  it('excludes ongoing and deleted records from period length averages', () => {
    expect(summarizePeriods([])).toEqual({
      averageLength: undefined,
      averageInterval: undefined,
      count: 0,
    });
    expect(
      summarizePeriods([
        record,
        { ...record, id: 'two', startDate: '2026-09-05', endDate: undefined },
      ]),
    ).toEqual({ averageLength: 5, averageInterval: 7, count: 1 });
  });
});
