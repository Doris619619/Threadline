/** @fileoverview 多任务计时器的纯时间规则，以绝对时间恢复后台/刷新后的计时，不累加定时器 tick。 */
import type { Task } from '@/types/domain';
export type TaskTimer = {
  id: string;
  taskId: string;
  title: string;
  mode: 'up' | 'down';
  targetMs: number;
  elapsedMs: number;
  startedAt?: number;
  entryDate: string;
  pending?: { original: Task; minutes: number };
};
/** 后台挂起与刷新仍按墙钟累计；倒计时到零停止，系统时钟回拨不产生负耗时。 */
export function timerElapsed(timer: TaskTimer, now: number) {
  const elapsed =
    timer.elapsedMs +
    (timer.startedAt === undefined ? 0 : Math.max(0, now - timer.startedAt));
  return timer.mode === 'down' ? Math.min(timer.targetMs, elapsed) : elapsed;
}
/** 暂停保留精确毫秒，继续从新时间锚点计算。 */
export function pauseTimer(timer: TaskTimer, now: number): TaskTimer {
  return { ...timer, elapsedMs: timerElapsed(timer, now), startedAt: undefined };
}
/** 分秒显示不依赖地区格式，超一小时仍显示完整小时。 */
export function timerClock(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds / 60) % 60;
  const s = seconds % 60;
  return (
    (h ? String(h).padStart(2, '0') + ':' : '') +
    String(m).padStart(2, '0') +
    ':' +
    String(s).padStart(2, '0')
  );
}
/** 仅接纳当前版本有效的三条记录，损坏本地缓存不能制造无期限倒计时。 */
export function normalizeTaskTimers(value: TaskTimer[]): TaskTimer[] {
  return Array.isArray(value)
    ? value
        .filter(
          (timer) =>
            timer &&
            typeof timer.id === 'string' &&
            typeof timer.taskId === 'string' &&
            ['up', 'down'].includes(timer.mode) &&
            Number.isFinite(timer.elapsedMs) &&
            timer.elapsedMs >= 0 &&
            Number.isFinite(timer.targetMs) &&
            timer.targetMs > 0 &&
            (timer.startedAt === undefined || Number.isFinite(timer.startedAt)) &&
            /^\d{4}-\d{2}-\d{2}$/.test(timer.entryDate),
        )
        .slice(0, 3)
    : [];
}
