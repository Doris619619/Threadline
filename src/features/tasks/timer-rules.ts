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
  /** 首次启动的绝对时刻；暂停、继续和刷新都保留，旧缓存可能缺失。 */
  firstStartedAt?: number;
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
/** 统一用时分秒，小时不在一天后归零，避免短计时与跨日计时显示不同格式。 */
export function timerClock(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds / 60) % 60;
  const s = seconds % 60;
  return (
    String(h).padStart(2, '0') +
    ':' +
    String(m).padStart(2, '0') +
    ':' +
    String(s).padStart(2, '0')
  );
}
/** 仅接纳三条有效记录；旧版仅在未累计过暂停耗时时恢复首次启动锚点，不猜历史开始时间。 */
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
            (timer.firstStartedAt === undefined ||
              (Number.isFinite(timer.firstStartedAt) &&
                timer.firstStartedAt >= 0 &&
                timer.firstStartedAt <= 8.64e15)) &&
            /^\d{4}-\d{2}-\d{2}$/.test(timer.entryDate),
        )
        .map((timer) =>
          timer.firstStartedAt === undefined &&
          timer.elapsedMs === 0 &&
          timer.startedAt !== undefined &&
          timer.startedAt >= 0 &&
          timer.startedAt <= 8.64e15
            ? { ...timer, firstStartedAt: timer.startedAt }
            : timer,
        )
        .slice(0, 3)
    : [];
}
