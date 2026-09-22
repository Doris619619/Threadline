/**
 * @fileoverview 显式映射 PostgreSQL date/time/timestamp，避免本地墙钟被隐式转换为 UTC。
 */

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}(?::\d{2})?$/;
const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/** 校验 YYYY-MM-DD 的真实日历值，拒绝正则可通过但 PostgreSQL 会归一化的日期。 */
function isRealDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** 校验 HH:mm(:ss) 的真实墙钟值，不让 24:30 之类字符串越过客户端边界。 */
function isRealTime(value: string): boolean {
  if (!timePattern.test(value)) return false;
  const [hour, minute, second = '0'] = value.split(':');
  return Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60;
}

/** 校验并返回 PostgreSQL date 字符串，不调用 Date。 */
export function toDatabaseDate(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!isRealDate(value)) throw new Error(`Invalid business date: ${value}`);
  return value;
}

/** 校验并返回本地墙钟 time；数据库秒位在 UI 中收敛为 HH:mm。 */
export function toDatabaseWallTime(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!isRealTime(value)) throw new Error(`Invalid wall-clock time: ${value}`);
  return value.length === 5 ? `${value}:00` : value;
}

/** 把 PostgreSQL time 映射为 `<input type=time>` 使用的 HH:mm。 */
export function fromDatabaseWallTime(value: string | null): string | undefined {
  return value === null ? undefined : value.slice(0, 5);
}

/** 校验 datetime-local 值并保持 timestamp without time zone，不附加时区。 */
export function toDatabaseLocalDateTime(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (
    !localDateTimePattern.test(value) ||
    !isRealDate(value.slice(0, 10)) ||
    !isRealTime(value.slice(11))
  )
    throw new Error(`Invalid local datetime: ${value}`);
  return value.length === 16 ? `${value}:00` : value;
}

/** 把 timestamp without time zone 映射回 datetime-local，不经过 Date。 */
export function fromDatabaseLocalDateTime(value: string | null): string | undefined {
  return value === null ? undefined : value.replace(' ', 'T').slice(0, 16);
}

/** 审计时间是绝对 instant；解析失败时拒绝把损坏数据带入领域层。 */
export function fromDatabaseInstant(value: string | null): string | undefined {
  if (value === null) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error(`Invalid timestamptz: ${value}`);
  return date.toISOString();
}

/** 校验并原样保留数据库并发令牌；Date 只用于校验，不能截掉 PostgreSQL 微秒。 */
export function fromDatabaseVersionInstant(value: string | null): string | undefined {
  fromDatabaseInstant(value);
  return value ?? undefined;
}
