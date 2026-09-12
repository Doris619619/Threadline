/**
 * @fileoverview 本地业务日期的范围与月历网格工具；范围逻辑不与基础 LocalDateKey 解析混放。
 */

import {
  addLocalDateDays,
  formatCalendarDate,
  parseLocalDateKey,
  type LocalDateKey,
} from '@/lib/local-date';

export type DateRangePreset = 'day' | 'week' | 'month' | 'custom';
export type LocalDateRange = { start: LocalDateKey; end: LocalDateKey };

/** 将两个本地日期规范为包含首尾的升序范围，避免调用方自行处理反向输入。 */
export function createLocalDateRange(start: string, end: string): LocalDateRange {
  const startDate = parseLocalDateKey(start);
  const endDate = parseLocalDateKey(end);
  return startDate <= endDate
    ? { start: formatCalendarDate(startDate), end: formatCalendarDate(endDate) }
    : { start: formatCalendarDate(endDate), end: formatCalendarDate(startDate) };
}

/** 按本地日期逐日遍历包含首尾的范围，供 analytics 与报告使用。 */
export function iterateLocalDateRange(range: LocalDateRange): LocalDateKey[] {
  const dates: LocalDateKey[] = [];
  for (let date = range.start; date <= range.end; date = addLocalDateDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

/** 返回以周一开始的当前周范围，不受运行环境星期日默认值影响。 */
export function getWeekRange(anchor: string): LocalDateRange {
  const date = parseLocalDateKey(anchor);
  const mondayOffset = (date.getDay() + 6) % 7;
  const start = addLocalDateDays(anchor, -mondayOffset);
  return { start, end: addLocalDateDays(start, 6) };
}

/** 返回锚点所在本地自然月的完整范围。 */
export function getMonthRange(anchor: string): LocalDateRange {
  const date = parseLocalDateKey(anchor);
  const start = formatCalendarDate(new Date(date.getFullYear(), date.getMonth(), 1));
  const end = formatCalendarDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  return { start, end };
}

/** 根据可见筛选预设构造范围；custom 必须提供两个明确的本地日期。 */
export function getPresetDateRange(
  preset: DateRangePreset,
  anchor: string,
  custom?: LocalDateRange,
): LocalDateRange {
  if (preset === 'day')
    return {
      start: formatCalendarDate(parseLocalDateKey(anchor)),
      end: formatCalendarDate(parseLocalDateKey(anchor)),
    };
  if (preset === 'week') return getWeekRange(anchor);
  if (preset === 'month') return getMonthRange(anchor);
  if (!custom) throw new RangeError('Custom range requires start and end dates.');
  return createLocalDateRange(custom.start, custom.end);
}

/** 返回与当前范围等长、紧挨其前的比较周期，避免月度与自定义范围产生不同算法。 */
export function getPreviousEqualLengthRange(range: LocalDateRange): LocalDateRange {
  const length = iterateLocalDateRange(range).length;
  const end = addLocalDateDays(range.start, -1);
  return { start: addLocalDateDays(end, -(length - 1)), end };
}

/** 生成周一开头的完整月历格，包含首尾补齐日期，供 Calendar 稳定渲染六列周。 */
export function getMonthGrid(anchor: string): LocalDateKey[] {
  const month = getMonthRange(anchor);
  const first = parseLocalDateKey(month.start);
  const leading = (first.getDay() + 6) % 7;
  const last = parseLocalDateKey(month.end);
  const trailing = (7 - ((last.getDay() + 6) % 7) - 1) % 7;
  return iterateLocalDateRange({
    start: addLocalDateDays(month.start, -leading),
    end: addLocalDateDays(month.end, trailing),
  });
}
