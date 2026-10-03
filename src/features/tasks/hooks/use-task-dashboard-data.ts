/**
 * @fileoverview 汇总任务首页的派生数据，不执行持久化或交互副作用。
 */

import type { Daily, DailyHistoryEntry } from '@/features/daily/types';
import { getDailyActualMinutes, isDailyCompleted } from '@/features/daily/daily-rules';
import { addLocalDateDays } from '@/lib/local-date';
import { isGeneralWaitingTask } from '@/features/stage-plans/rules';
import type { CloseRecord, Project, Task, TaskTimeEntry } from '@/types/domain';

/**
 * 从工作日期派生日程与 Daily 的总量/剩余；完成态不减少总预计，实际耗时不自动扣减预计。
 * 显式能力决定实际耗时真源或测试 fallback。
 */
export function useTaskDashboardData({
  tasks,
  taskTimeEntries,
  taskTimeEntriesAuthoritative,
  projects,
  dailyByDate,
  dailyHistory,
  closeRecords,
  selectedDate,
}: {
  tasks: Task[];
  taskTimeEntries: TaskTimeEntry[];
  taskTimeEntriesAuthoritative: boolean;
  projects: Project[];
  dailyByDate: Record<string, Daily[]>;
  dailyHistory: DailyHistoryEntry[];
  closeRecords: CloseRecord[];
  selectedDate: string;
}) {
  const shown = tasks.filter(
    (task) => task.status === 'active' && task.date === selectedDate,
  );
  const movedFromSelectedDate = tasks.filter(
    (task) =>
      task.status === 'active' &&
      task.date !== selectedDate &&
      task.postponedFrom === selectedDate,
  );
  const daily = dailyByDate[selectedDate] ?? [];
  /** 所有当前业务日 active task 都属于日程；仅以开始时间决定其在有时间段之前或之后。 */
  const timed = [...shown].sort((left, right) => {
    if (left.plannedStartTime && right.plannedStartTime)
      return left.plannedStartTime.localeCompare(right.plannedStartTime);
    if (left.plannedStartTime) return -1;
    if (right.plannedStartTime) return 1;
    return 0;
  });
  const waiting = tasks.filter(isGeneralWaitingTask);
  const done = shown.filter((task) => task.completed).length;
  const actual = taskTimeEntriesAuthoritative
    ? taskTimeEntries
        .filter((entry) => entry.date === selectedDate)
        .reduce((sum, entry) => sum + entry.minutes, 0)
    : shown.reduce((sum, task) => sum + (task.actualDurationMinutes ?? 0), 0);
  const dailyActual = daily.reduce((sum, item) => sum + getDailyActualMinutes(item), 0);
  const dailyDone = daily.filter(isDailyCompleted).length;
  const totalEstimates = [
    ...shown.map((task) => task.plannedDurationMinutes),
    ...daily.flatMap((item) =>
      item.children.length
        ? item.children.map((child) => child.plannedDurationMinutes)
        : [undefined],
    ),
  ];
  const totalPlannedMinutes = totalEstimates.reduce<number>(
    (sum, minutes) => sum + (minutes ?? 0),
    0,
  );
  const totalMissingCount = totalEstimates.filter(
    (minutes) => minutes === undefined,
  ).length;
  // Daily 的父完成态允许「做过任一子项」，剩余工作量仍按未完成子项计算。
  const remainingEstimates = [
    ...shown
      .filter((task) => !task.completed)
      .map((task) => task.plannedDurationMinutes),
    ...daily.flatMap((item) =>
      item.children.length
        ? item.children
            .filter((child) => !child.completed)
            .map((child) => child.plannedDurationMinutes)
        : item.completed
          ? []
          : [undefined],
    ),
  ];
  const remainingPlannedMinutes = remainingEstimates.reduce<number>(
    (sum, minutes) => sum + (minutes ?? 0),
    0,
  );
  const remainingMissingCount = remainingEstimates.filter(
    (minutes) => minutes === undefined,
  ).length;

  return {
    actual,
    analyticsInput: {
      tasks,
      taskTimeEntries: taskTimeEntriesAuthoritative ? taskTimeEntries : undefined,
      projects,
      dailyByDate,
      dailyHistory,
      closeRecords,
    },
    waiting,
    daily,
    dailyActual,
    dailyDone,
    done,
    isDayClosed: closeRecords.some((record) => record.date === selectedDate),
    normalTaskTotal: shown.length + movedFromSelectedDate.length,
    remainingPlannedMinutes,
    remainingMissingCount,
    totalPlannedMinutes,
    totalMissingCount,
    shown,
    timed,
    tomorrow: addLocalDateDays(selectedDate, 1),
  };
}
