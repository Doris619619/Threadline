/** @fileoverview 多任务计时器的纯时间规则，以绝对时间恢复计时和到时续时，等待续时的空档不计入耗时。 */
import type { Task } from '@/types/domain';
import {
  validTimerIntervals,
  type TimerInterval,
  type TimerRecording,
} from '@/lib/timer-accounting';
export type TaskTimer = {
  id: string;
  taskId: string;
  title: string;
  mode: 'up' | 'down';
  /** 倒计时的累计耗时上限；续时后为已用毫秒加本次追加时长，不是独立段的长度。 */
  targetMs: number;
  /** 之前实际运行段的累计耗时；暂停、到时等待和选时均不包含在内。 */
  elapsedMs: number;
  startedAt?: number;
  /** 首次启动的绝对时刻；暂停、继续和刷新都保留，旧缓存可能缺失。 */
  firstStartedAt?: number;
  entryDate: string;
  /** 仅新会话记录完整时段；旧缓存缺失时不推算历史。 */
  intervals?: TimerInterval[];
  timezone?: string;
  pending?: { original: Task; minutes: number; recording?: TimerRecording };
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
  const elapsedMs = timerElapsed(timer, now);
  const length = elapsedMs - timer.elapsedMs;
  const intervals =
    timer.intervals === undefined
      ? undefined
      : [
          ...timer.intervals,
          ...(timer.startedAt !== undefined && length > 0
            ? [{ start: timer.startedAt, end: timer.startedAt + length }]
            : []),
        ];
  return {
    ...timer,
    ...(intervals ? { intervals } : {}),
    elapsedMs,
    startedAt: undefined,
  };
}
/**
 * 为已到时且没有待保存账目的倒计时追加 1..1440 整数分钟并立即恢复。
 * 先按旧目标冻结耗时，排除后台到时后等待续时的空档；身份、首次开始和归属日期保持不变。
 * 不符合条件或输入无效时返回原对象，不产生持久化变更。
 */
export function extendCountdown(
  timer: TaskTimer,
  minutes: number,
  now: number,
): TaskTimer {
  if (
    timer.mode !== 'down' ||
    timer.pending ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 1440 ||
    !Number.isFinite(now)
  )
    return timer;
  const elapsed = timerElapsed(timer, now);
  if (!Number.isFinite(elapsed) || elapsed < timer.targetMs) return timer;
  return {
    ...pauseTimer(timer, now),
    elapsedMs: elapsed,
    targetMs: elapsed + minutes * 60000,
    startedAt: now,
  };
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
        .map((timer) => {
          // 损坏或旧缓存只降级为无时段记录，不能丢弃已经累计的原始分钟。
          if (
            timer.intervals !== undefined &&
            (!validTimerIntervals(timer.intervals) ||
              !timer.timezone ||
              timer.intervals.reduce((sum, part) => sum + part.end - part.start, 0) !==
                timer.elapsedMs)
          ) {
            timer = { ...timer, intervals: undefined, timezone: undefined };
          }
          return timer.firstStartedAt === undefined &&
            timer.elapsedMs === 0 &&
            timer.startedAt !== undefined &&
            timer.startedAt >= 0 &&
            timer.startedAt <= 8.64e15
            ? { ...timer, firstStartedAt: timer.startedAt }
            : timer;
        })
        .slice(0, 3)
    : [];
}
