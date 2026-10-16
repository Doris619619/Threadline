/** @fileoverview 保存原始计时时段，并按账号范围去重、逐时段按任务均分；未知时段的旧账本保持原值。 */
import { Temporal } from '@js-temporal/polyfill';
import type { TaskTimeEntry } from '@/types/domain';

export type TimerInterval = { start: number; end: number };
export type TimerRecording = {
  id: string;
  intervals: TimerInterval[];
  timezone: string;
};
export type RecordedTimer = TimerRecording & {
  taskId?: string;
  taskKey: string;
  projectId: string;
  date: string;
  rawMinutes: number;
  ledgerId?: string;
};

/** 校验已完成区间，拒绝非整数、倒序与重叠；暂停空档不得填平。 */
export function validTimerIntervals(intervals: TimerInterval[]) {
  return (
    Array.isArray(intervals) &&
    intervals.length <= 10000 &&
    intervals.every(
      (part, index) =>
        part !== null &&
        typeof part === 'object' &&
        Number.isSafeInteger(part.start) &&
        Number.isSafeInteger(part.end) &&
        part.start >= 0 &&
        part.end > part.start &&
        part.end <= 8640000000000000 &&
        (index === 0 || part.start >= intervals[index - 1].end),
    )
  );
}

/** 以会话启动时账号时区拆分自然日，按真实时间处理夏令时，不把跨日分钟全归到启动日。 */
function splitDays(timer: RecordedTimer) {
  return timer.intervals.flatMap(({ start, end }) => {
    const result: (TimerInterval & { date: string; timer: RecordedTimer })[] = [];
    while (start < end) {
      const zoned = Temporal.Instant.fromEpochMilliseconds(start).toZonedDateTimeISO(
        timer.timezone,
      );
      const midnight = zoned.startOfDay().add({ days: 1 }).epochMilliseconds;
      const next = Math.min(end, midnight);
      result.push({ start, end: next, date: zoned.toPlainDate().toString(), timer });
      start = next;
    }
    return result;
  });
}

/** 全部会话先分配再筛日期/项目；同一任务跨设备重复计时只占一份，未知分钟不猜测去重。 */
export function allocateTimerEntries(
  entries: TaskTimeEntry[],
  timers: RecordedTimer[],
): TaskTimeEntry[] {
  const result = entries.map((entry) => ({
    ...entry,
    rawMinutes: entry.minutes,
    minutes: Math.max(
      0,
      entry.minutes -
        timers
          .filter((timer) => timer.ledgerId === entry.id)
          .reduce((sum, timer) => sum + timer.rawMinutes, 0),
    ),
    timing: 'unlocated' as const,
  }));
  const parts = timers.flatMap(splitDays);
  const events = new Map<number, { added: typeof parts; removed: typeof parts }>();
  for (const part of parts) {
    if (!events.has(part.start)) events.set(part.start, { added: [], removed: [] });
    if (!events.has(part.end)) events.set(part.end, { added: [], removed: [] });
    events.get(part.start)!.added.push(part);
    events.get(part.end)!.removed.push(part);
  }
  const active = new Set<(typeof parts)[number]>();
  const allocated = new Map<string, TaskTimeEntry>();
  const boundaries = [...events.keys()].sort((a, b) => a - b);
  for (let i = 0; i < boundaries.length - 1; i++) {
    const stamp = boundaries[i];
    const event = events.get(stamp)!;
    event.removed.forEach((part) => active.delete(part));
    event.added.forEach((part) => active.add(part));
    const participants = new Map<string, (typeof parts)[number]>();
    for (const part of active) {
      const prior = participants.get(part.timer.taskKey);
      if (!prior || part.timer.id < prior.timer.id)
        participants.set(part.timer.taskKey, part);
    }
    const minutes = (boundaries[i + 1] - stamp) / 60000 / participants.size;
    for (const { timer, date } of participants.values()) {
      const id = timer.id + ':' + date;
      const row = allocated.get(id) ?? {
        id,
        taskId: timer.taskId,
        projectId: timer.projectId,
        date,
        minutes: 0,
        rawMinutes: 0,
        timing: 'allocated' as const,
      };
      row.minutes += minutes;
      allocated.set(id, row);
    }
  }
  return [...result, ...allocated.values()];
}
