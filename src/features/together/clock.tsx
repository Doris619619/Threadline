/** @fileoverview 面板独立时钟按账号时区显示到分钟；订阅时钟不带动表单和列表重绘。 */
'use client';
import { useSyncExternalStore } from 'react';
import {
  getAccountTimezone,
  timezoneLabel,
  subscribeAccountClock,
} from '@/lib/account-clock';
/** 秒级快照保持稳定，服务端只输出占位，避免水合期间瞬间差异。 */
function clockSnapshot() {
  return Math.floor(Date.now() / 1000);
}
/** 定时器只订阅时钟区域，卸载后立即清理。 */
function subscribeClock(notify: () => void) {
  const timer = setInterval(notify, 1000);
  return () => clearInterval(timer);
}
/** 服务端与首次水合使用同一空快照。 */
function serverClock() {
  return 0;
}
/** 时区改变后立即更新显示；客户端暂停后恢复时按当前瞬间重新计算。 */
export function SpaceClock() {
  const zone = useSyncExternalStore(
    subscribeAccountClock,
    getAccountTimezone,
    () => 'UTC',
  );
  const seconds = useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
  if (!seconds) return <div className="together-clock">正在读取时间…</div>;
  const now = new Date(seconds * 1000);
  return (
    <div className="together-clock">
      <time dateTime={now.toISOString()}>
        {new Intl.DateTimeFormat('zh-CN', {
          timeZone: zone,
          month: 'numeric',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(now)}
      </time>
      <span>{timezoneLabel(zone)}</span>
    </div>
  );
}
