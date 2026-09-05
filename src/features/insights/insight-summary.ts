/** @fileoverview 洞察完成与估时样本口径；缺失预计不参与偏差比较，实际总数仍由共享 analytics 计算。 */
import type { AnalyticsInput } from '@/lib/analytics';

/** 按选定业务日筛选普通任务，估时仅比较同时具备预计和实际记录的任务。 */
export function buildInsightSummary(
  input: AnalyticsInput & { range: NonNullable<AnalyticsInput['range']> },
) {
  const inRange = (date?: string) =>
    Boolean(date && date >= input.range.start && date <= input.range.end);
  const tasks = input.tasks.filter(
    (task) => task.status === 'active' && inRange(task.date),
  );
  const paired = tasks.flatMap((task) => {
    if (task.plannedDurationMinutes === undefined) return [];
    const entries = input.taskTimeEntries?.filter(
      (entry) => entry.taskId === task.id && inRange(entry.date),
    );
    const actual =
      entries !== undefined
        ? entries.length
          ? entries.reduce((sum, entry) => sum + entry.minutes, 0)
          : undefined
        : task.actualDurationMinutes;
    return actual === undefined
      ? []
      : [{ planned: task.plannedDurationMinutes, actual }];
  });
  return {
    total: tasks.length,
    completed: tasks.filter((task) => task.completed).length,
    pairedCount: paired.length,
    planned: paired.reduce((sum, task) => sum + task.planned, 0),
    actual: paired.reduce((sum, task) => sum + task.actual, 0),
  };
}
