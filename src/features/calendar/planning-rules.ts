/** @fileoverview 从普通任务派生规划日期分组、任务密度和未完成预计，不读取 Daily 或投入账本。 */
import type { Task } from '@/types/domain';

/** 仅按当前安排日期归组；已完成任务仍保留位置，移期来源不重复计数。 */
export function groupPlanningTasks(tasks: Task[]): Map<string, Task[]> {
  const days = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.status !== 'active' || !task.date) continue;
    days.set(task.date, [...(days.get(task.date) ?? []), task]);
  }
  return days;
}

/** 四档任务数量仅表示安排密度，不代表预计或实际工作量。 */
export function planningHeat(count: number): number {
  return count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : 3;
}

/** 按完成与时间分组，未估时不能当成零分钟混入预计文案。 */
export function planningDay(tasks: Task[]) {
  const pending = tasks.filter((task) => !task.completed);
  return {
    pending,
    timed: pending
      .filter((task) => task.plannedStartTime)
      .sort((a, b) => a.plannedStartTime!.localeCompare(b.plannedStartTime!)),
    untimed: pending.filter((task) => !task.plannedStartTime),
    completed: tasks.filter((task) => task.completed),
    estimated: pending.reduce(
      (sum, task) => sum + (task.plannedDurationMinutes ?? 0),
      0,
    ),
    unestimated: pending.filter((task) => task.plannedDurationMinutes === undefined)
      .length,
  };
}
