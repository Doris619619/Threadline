/** @fileoverview 当前浏览器账号的统一时钟；只保存已确认时区，日期值与绝对时间分别处理。 */
let timezone: string | undefined;
const listeners = new Set<() => void>();

/** 设备时区仅作为未设置账号的首次默认值，已有选择永远优先。 */
export function getAccountTimezone(): string {
  return timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

/** 账号 Provider 在挂载业务树前设置、退出时清除，服务端不写入此会话状态。 */
export function setAccountTimezone(value: string | undefined): void {
  if (value) new Intl.DateTimeFormat('en', { timeZone: value }).format();
  timezone = value;
  notifyAccountClock();
}

/** 同时供日期变化和时区变化订阅使用；无变化的快照不会触发 React 重渲染。 */
export function notifyAccountClock(): void {
  for (const listener of listeners) listener();
}

/** 注册当前账号时钟监听，清理时不留下跨账号订阅。 */
export function subscribeAccountClock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 将绝对时间转换为所选时区的日期/24 小时钟面，不经过电脑的墙钟。 */
export function accountClockParts(instant = new Date(), zone = getAccountTimezone()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}:${value('second')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

/** 常用时区显示可辨认的城市名称，其他 IANA 时区保留完整标识。 */
export function timezoneLabel(zone: string): string {
  return (
    (
      {
        'Asia/Shanghai': '中国 · 北京时间',
        'America/New_York': '美国 · 纽约',
        'America/Los_Angeles': '美国 · 洛杉矶',
        'Asia/Tokyo': '日本 · 东京',
        'Europe/London': '英国 · 伦敦',
        UTC: 'UTC · 协调世界时',
      } as Record<string, string>
    )[zone] ?? zone
  );
}
