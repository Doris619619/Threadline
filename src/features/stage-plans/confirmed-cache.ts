/** @fileoverview 合并阶段事务的确认回包；精确比较数据库版本，保留已经收到的更新状态。 */
import { Temporal } from '@js-temporal/polyfill';

/** 延迟回包只替换同 ID 的旧版本；保留微秒和时区信息，不用毫秒 Date 比较。 */
export function mergeConfirmedRows<T extends { id: string; updatedAt: string }>(
  current: T[],
  confirmed: T[],
): T[] {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of confirmed) {
    const existing = rows.get(row.id);
    if (!existing || Temporal.Instant.compare(existing.updatedAt, row.updatedAt) <= 0)
      rows.set(row.id, row);
  }
  return [...rows.values()];
}
