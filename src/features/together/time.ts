/** @fileoverview 所有展示使用查看者账号时区；输入墙钟显式处理夏令时，按提交瞬间判断是否按时。 */
import { Temporal } from '@js-temporal/polyfill';
import { accountClockParts } from '@/lib/account-clock';
import type { Flag } from './types';
/** 新建默认是账号本地当天的 23:59，而非电脑日期。 */
export function defaultDeadline(zone: string, now = new Date()) {
  return `${accountClockParts(now, zone).date}T23:59`;
}
/** 编辑转回查看者时区，绝不把 ISO UTC 截断当作 datetime-local。 */
export function localDeadline(instant: string, zone: string) {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString()
    .slice(0, 16);
}
/** 拒绝夏令时不存在或重复的墙钟，用户改为明确时刻后再发布。 */
export function deadlineInstant(local: string, zone: string) {
  try {
    return Temporal.PlainDateTime.from(local)
      .toZonedDateTime(zone, { disambiguation: 'reject' })
      .toInstant()
      .toString();
  } catch {
    throw new Error('这个时间无效，或在夏令时切换时出现两次；请换一个明确的时间。');
  }
}
/** 日期、小时按查看者账号时区显示，详情另标时区。 */
export function spaceTime(instant: string, zone: string) {
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
