/** @fileoverview 将同日计划时间转换为时间轴位置与碰撞分栏；预计投入不参与时间计算。 */
import type { Task } from '@/types/domain';

export type TimelineEvent = {
  task: Task;
  start: number;
  end?: number;
  displayEnd: number;
  column: number;
};
export type TimelineGroup = {
  start: number;
  end: number;
  columns: number;
  events: TimelineEvent[];
};

/** 解析同日 HH:mm，拒绝不完整或越界时间，避免坏数据使 CSS 坐标失效。 */
export function planningMinutes(time?: string): number | undefined {
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return undefined;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

/** 输出刻度文案；仅允许时间轴终点使用 24:00。 */
export function planningTimeLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * 按真实开始时间排位；短任务与无结束时间任务预留 30 分钟显示空间，实际时长另用色条表达。
 * 碰撞按显示空间分栏，连续任务不会被最小点击高度遮挡；四列以上由 UI 聚合入口展开。
 */
export function layoutPlanningTimeline(tasks: Task[]) {
  const events: TimelineEvent[] = tasks
    .flatMap((task) => {
      const start = planningMinutes(task.plannedStartTime);
      if (start === undefined) return [];
      const candidate = planningMinutes(task.plannedEndTime);
      const end = candidate !== undefined && candidate >= start ? candidate : undefined;
      return [
        { task, start, end, displayEnd: Math.max(start + 30, end ?? start), column: 0 },
      ];
    })
    .sort(
      (a, b) =>
        a.start - b.start ||
        b.displayEnd - a.displayEnd ||
        a.task.id.localeCompare(b.task.id),
    );
  const groups: TimelineGroup[] = [];
  let lanes: number[] = [];
  for (const event of events) {
    let group = groups.at(-1);
    if (!group || event.start >= group.end) {
      group = { start: event.start, end: event.displayEnd, columns: 0, events: [] };
      groups.push(group);
      lanes = [];
    }
    let column = lanes.findIndex((end) => end <= event.start);
    if (column < 0) column = lanes.length;
    lanes[column] = event.displayEnd;
    event.column = column;
    group.columns = Math.max(group.columns, lanes.length);
    group.end = Math.max(group.end, event.displayEnd);
    group.events.push(event);
  }
  // 默认呈现 08–20 点，早晚任务自动扩展；末尾显示空间可越过 24 点但不生成次日任务。
  const start = Math.min(8 * 60, events[0]?.start ?? 8 * 60);
  const end = Math.max(20 * 60, ...events.map((event) => event.displayEnd));
  return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60, groups };
}
