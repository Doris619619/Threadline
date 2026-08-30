/**
 * @fileoverview 汇总任务首页的派生数据，不执行持久化或交互副作用。
 */

import type { Daily, DailyHistoryEntry } from '@/features/daily/types';
import { getDailyActualMinutes, isDailyCompleted } from '@/features/daily/daily-rules';
import { addLocalDateDays } from '@/lib/local-date';
import type { CloseRecord, Project, Task, TaskTimeEntry } from '@/types/domain';

/**
 * 从当前工作日期和持久化领域数据派生首页、紧凑窗口与分析页所需的稳定视图模型。
 */
export function useTaskDashboardData({
  tasks,
  taskTimeEntries,
  projects,
  dailyByDate,
  dailyHistory,
  closeRecords,
  selectedDate,
}: {
  tasks: Task[];
  taskTimeEntries: TaskTimeEntry[];
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
  const timed = shown
    .filter((task) => Boolean(task.plannedStartTime) || task.schedulePendingTime)
    .sort((left, right) => {
      if (left.schedulePendingTime !== right.schedulePendingTime)
        return left.schedulePendingTime ? -1 : 1;
      if (left.plannedStartTime && right.plannedStartTime)
        return left.plannedStartTime.localeCompare(right.plannedStartTime);
      if (left.plannedStartTime) return -1;
      if (right.plannedStartTime) return 1;
      return 0;
    });
  const quick = shown.filter(
    (task) => !task.plannedStartTime && !task.schedulePendingTime,
  );
  const backlog = tasks.filter((task) => task.status === 'backlog');
  const done = shown.filter((task) => task.completed).length;
  const hasTimeEntries = taskTimeEntries.length > 0;
  const actual = hasTimeEntries
    ? taskTimeEntries
        .filter((entry) => entry.date === selectedDate)
        .reduce((sum, entry) => sum + entry.minutes, 0)
    : shown.reduce((sum, task) => sum + (task.actualDurationMinutes ?? 0), 0);
  const dailyActual = daily.reduce((sum, item) => sum + getDailyActualMinutes(item), 0);
  const dailyDone = daily.filter(isDailyCompleted).length;

  return {
    actual,
    analyticsInput: {
      tasks,
      taskTimeEntries: hasTimeEntries ? taskTimeEntries : undefined,
      projects,
      dailyByDate,
      dailyHistory,
      closeRecords,
    },
    backlog,
    daily,
    dailyActual,
    dailyDone,
    done,
    isDayClosed: closeRecords.some((record) => record.date === selectedDate),
    normalTaskTotal: shown.length + movedFromSelectedDate.length,
    quick,
    shown,
    timed,
    tomorrow: addLocalDateDays(selectedDate, 1),
  };
}
