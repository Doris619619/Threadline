/** @fileoverview 所有展示使用查看者账号时区；输入墙钟显式处理夏令时，按提交瞬间判断是否按时。 */
import { Temporal } from '@js-temporal/polyfill';
import { accountClockParts } from '@/lib/account-clock';
import type { Flag } from './types';
const deadlineMin = Date.parse('1900-01-01T00:00:00Z');
const deadlineMax = Date.parse('+010000-01-01T00:00:00Z');
export const invalidSpaceTime = '时间数据异常，请联系空间成员核对';
/** 与数据库保持同一 UTC 边界；历史、逾期时间仍然合法。 */
export function validSpaceTime(instant: string) {
  const value = Date.parse(instant);
  return Number.isFinite(value) && value >= deadlineMin && value < deadlineMax;
}
/** 新建默认是账号本地当天的 23:59，而非电脑日期。 */
export function defaultDeadline(zone: string, now = new Date()) {
  return `${accountClockParts(now, zone).date}T23:59`;
}
/** 编辑转回查看者时区，绝不把 ISO UTC 截断当作 datetime-local。 */
export function localDeadline(instant: string, zone: string) {
  if (!validSpaceTime(instant)) return '';
  try {
    const local = Temporal.Instant.from(instant)
      .toZonedDateTimeISO(zone)
      .toPlainDateTime();
    return local.year >= 1900 && local.year <= 9999
      ? local.toString().slice(0, 16)
      : '';
  } catch {
    return '';
  }
}
/** 拒绝夏令时不存在或重复的墙钟，用户改为明确时刻后再发布。 */
export function deadlineInstant(local: string, zone: string) {
  try {
    const instant = Temporal.PlainDateTime.from(local)
      .toZonedDateTime(zone, { disambiguation: 'reject' })
      .toInstant()
      .toString();
    if (!validSpaceTime(instant)) throw new Error('INVALID_DEADLINE');
    return instant;
  } catch {
    throw new Error(
      '请填写 1900–9999 年的有效时间；夏令时缺失或重复的时刻需重新选择。',
    );
  }
}
/** 日期、小时按查看者账号时区显示，详情另标时区。 */
export function spaceTime(instant: string, zone: string) {
  if (!validSpaceTime(instant)) return invalidSpaceTime;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: zone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}
/** 卡片只展示月日和分钟；完整年份和查看时区保留在详情与悬停说明中。 */
export function shortSpaceTime(instant: string, zone: string) {
  if (!validSpaceTime(instant)) return invalidSpaceTime;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: zone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}
/** 等待验收或补交不制造新的逾期，以首次正式提交为准。 */
export function isLate(flag: Flag, now = Date.now()) {
  return (
    (flag.first_submitted_at ? Date.parse(flag.first_submitted_at) : now) >
    Date.parse(flag.deadline)
  );
}
