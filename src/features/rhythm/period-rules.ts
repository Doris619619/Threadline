/** @fileoverview 生理期日期校验与描述性统计，只计算已记录事实，不产生预测。 */
import { differenceInCalendarDays } from 'date-fns';
import { parseLocalDateKey } from '@/lib/local-date';

export type PeriodRecord = {
  id: string;
  startDate: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};
export type PeriodDraft = Pick<PeriodRecord, 'id' | 'startDate' | 'endDate'>;

/** 包含起止两天，使用本地日历差避免跨夏令时天数偏移。 */
export function periodDays(start: string, end: string): number {
  return differenceInCalendarDays(parseLocalDateKey(end), parseLocalDateKey(start)) + 1;
}

/** 保存前校验合法日期、未来日期及同账号未删除记录间的重叠。 */
export function validatePeriod(
  draft: PeriodDraft,
  records: PeriodRecord[],
  today: string,
): void {
  try {
    parseLocalDateKey(draft.startDate);
    if (draft.endDate) parseLocalDateKey(draft.endDate);
  } catch {
    throw new Error('请选择有效的开始和结束日期');
  }
  if (draft.startDate > today || (draft.endDate && draft.endDate > today))
    throw new Error('生理期记录不能填写未来日期');
  if (draft.endDate && draft.endDate < draft.startDate)
    throw new Error('结束日期不能早于开始日期');
  if (
    records.some(
      (record) =>
        !record.deletedAt &&
        record.id !== draft.id &&
        record.startDate <= (draft.endDate ?? '9999-12-31') &&
        draft.startDate <= (record.endDate ?? '9999-12-31'),
    )
  )
    throw new Error('日期与已有记录重叠，请先修改或结束已有记录');
}

/** 经期均值只使用已结束记录；开始日期间隔至少需要两次记录。 */
export function summarizePeriods(records: PeriodRecord[]) {
  const sorted = records
    .filter((record) => !record.deletedAt)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const finished = sorted.filter((record) => record.endDate);
  const lengths = finished.map((record) =>
    periodDays(record.startDate, record.endDate!),
  );
  const intervals = sorted
    .slice(1)
    .map((record, index) => periodDays(sorted[index].startDate, record.startDate) - 1);
  return {
    averageLength: lengths.length
      ? Math.round((lengths.reduce((a, b) => a + b, 0) / lengths.length) * 10) / 10
      : undefined,
    averageInterval: intervals.length
      ? Math.round((intervals.reduce((a, b) => a + b, 0) / intervals.length) * 10) / 10
      : undefined,
    count: finished.length,
  };
}
