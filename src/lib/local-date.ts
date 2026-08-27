/**
 * @fileoverview 提供 Threadline 唯一的本地日历日期读写入口，避免业务日期意外按 UTC 偏移。
 */

export type LocalDateKey = `${number}-${string}-${string}`;

/** 将 Date 转为用户本地时区的 yyyy-MM-dd 业务日期，不使用 UTC ISO 截取。 */
export function getLocalDateKey(date = new Date()): LocalDateKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 将合法的业务日期解析为本地午夜；非法值直接抛错，避免静默回退到错误日期。 */
export function parseLocalDateKey(value: string): Date {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) throw new RangeError(`Invalid local date key: ${value}`);
  const date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
  if (getLocalDateKey(date) !== value)
    throw new RangeError(`Invalid local date key: ${value}`);
  return date;
}

/** 在本地日历日上移动指定天数，处理跨月、跨年和夏令时，而不混入 UTC。 */
export function addLocalDateDays(value: string, amount: number): LocalDateKey {
  const date = parseLocalDateKey(value);
  date.setDate(date.getDate() + amount);
  return getLocalDateKey(date);
}
