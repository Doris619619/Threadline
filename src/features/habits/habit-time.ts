/** @fileoverview 账号时区的瞬间、墙钟及业务日转换；保留原始精度，明确处理夏令时歧义。 */
import { Temporal } from '@js-temporal/polyfill';
import type { HabitKind, RuleValues } from './habit-types';

/** 校验 IANA 时区而不是固定偏移；不让无效设置悄悄降级到设备日期。 */
export function validateHabitTimezone(timezone: string): void {
  if (!timezone || /^[+-]/.test(timezone)) throw new Error('请选择有效的 IANA 时区');
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new Error('请选择有效的 IANA 时区');
  }
}
/** 将实际瞬间转换为指定账号时区的本地日期时间，不截断原始时间戳。 */
export function habitLocalTime(instant: string, timezone: string): string {
  validateHabitTimezone(timezone);
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(timezone)
    .toPlainDateTime()
    .toString();
}
/** 日期运算不依赖设备时区，也不将一天假定为固定 86400000 毫秒。 */
export function habitAddDays(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}
/** 手填整段时间：睡觉 00:00–03:59 属于所选那晚的次日，起床始终在所选日期。 */
export function habitLocalForClock(
  date: string,
  kind: HabitKind,
  input: string,
): string {
  const value = input.trim().replace('：', ':');
  const match = /^(\d{1,2}):(\d{2})$/.exec(value) ?? /^(\d{2})(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
    throw new Error('请输入有效时间，例如 23:48 或 00:12');
  const time = `${match[1].padStart(2, '0')}:${match[2]}`;
  const actualDate = kind === 'sleep' && time < '04:00' ? habitAddDays(date, 1) : date;
  return `${actualDate}T${time}`;
}
/** 给编辑者展示具体发生日期，避免只写“次日”而需要自己换算。 */
export function habitActualTimeLabel(local: string): string {
  const value = Temporal.PlainDateTime.from(local);
  const period = value.hour < 4 ? '凌晨' : value.hour >= 18 ? '晚' : '';
  return `${value.month}月${value.day}日${period} ${local.slice(11, 16)}`;
}
/** 起床按自然日；睡觉和工作效率在账号墙钟 04:00 分日。 */
export function habitBusinessDate(
  instant: string,
  timezone: string,
  kind: HabitKind,
): string {
  const local = Temporal.Instant.from(instant).toZonedDateTimeISO(timezone);
  const date = local.toPlainDate().toString();
  return kind !== 'wake' && local.hour < 4 ? habitAddDays(date, -1) : date;
}
/** 从手填墙钟获得瞬间；缺失时刻拒绝，重复时刻要求选第一次或第二次。 */
export function resolveHabitLocalTime(
  local: string,
  timezone: string,
  choice?: 'earlier' | 'later',
): string {
  validateHabitTimezone(timezone);
  const plain = Temporal.PlainDateTime.from(local);
  const early = plain.toZonedDateTime(timezone, { disambiguation: 'earlier' });
  const late = plain.toZonedDateTime(timezone, { disambiguation: 'later' });
  if (!early.toPlainDateTime().equals(plain) || !late.toPlainDateTime().equals(plain))
    throw new Error('这个本地时间因夏令时跳时而不存在，请修改时间');
  if (early.epochMilliseconds !== late.epochMilliseconds && !choice)
    throw new Error('这个时间出现两次，请选择第一次或第二次');
  return (choice === 'later' ? late : early).toInstant().toString();
}
/** 展开跨午夜时间轴，允许显式把凌晨 04:30 等异常作息归到前一天。 */
export function habitMinutes(
  localTime: string,
  businessDate: string,
  kind: HabitKind,
): number {
  const local = Temporal.PlainDateTime.from(localTime);
  const days = Temporal.PlainDate.from(businessDate).until(local.toPlainDate()).days;
  return local.hour * 60 + local.minute + (kind === 'sleep' ? days * 1440 : 0);
}
/** 图表与设置共用格式；次日不能在详情中被误读为当天。 */
export function formatHabitMinutes(value: number, showDay = true): string {
  const minute = Math.round(value);
  const normalized = ((minute % 1440) + 1440) % 1440;
  return `${showDay && minute >= 1440 ? '次日 ' : ''}${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}
/** 独立睡觉分界必须按 04:00 到次日 04:00 的连续顺序排列。 */
export function validateHabitRules(rules: RuleValues): void {
  if (
    ![
      rules.wake_target,
      rules.sleep_target,
      rules.sleep_late,
      rules.sleep_very_late,
    ].every(Number.isInteger) ||
    rules.wake_target < 0 ||
    rules.wake_target >= 1440 ||
    rules.sleep_target < 240 ||
    rules.sleep_target >= rules.sleep_late ||
    rules.sleep_late >= rules.sleep_very_late ||
    rules.sleep_very_late >= 1680
  )
    throw new Error(
      '睡觉分界须在当天 04:00 至次日 03:59 内依次递增；起床目标须为有效时间',
    );
}
