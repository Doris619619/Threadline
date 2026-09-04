/** @fileoverview 把每日收尾表单转换成单次原子 close_day 命令，不拆分写入业务表。 */

import type { Project, Task, TaskTimeEntry } from '@/types/domain';

type CloseAction = {
  taskId: string;
  action: 'tomorrow' | 'date' | 'waiting' | 'abandoned';
  targetDate?: string;
};

/** 将收尾表单交给原子命令，并按显式能力选择 ledger 真源或测试 aggregate fallback。 */
export function useCloseDay({
  closeDay,
  projects,
  selectedDate,
  shown,
  taskTimeEntries,
  taskTimeEntriesAuthoritative,
  tomorrow,
}: {
  closeDay: (
    date: string,
    actions: CloseAction[],
    projectMinutes: Record<string, number>,
  ) => Promise<void>;
  projects: Project[];
  selectedDate: string;
  shown: Task[];
  taskTimeEntries: TaskTimeEntry[];
  taskTimeEntriesAuthoritative: boolean;
  tomorrow: string;
}) {
  return async (form: FormData) => {
    const actions = shown.flatMap<CloseAction>((task) => {
      const rawAction = form.get(`action-${task.id}`);
      if (!rawAction || task.completed) return [];
      const action = String(rawAction) as CloseAction['action'];
      const selectedTarget = String(form.get(`date-${task.id}`) ?? '');
      const targetDate = action === 'tomorrow' ? tomorrow : selectedTarget || undefined;
      return [{ taskId: task.id, action, targetDate }];
    });
    const taskMinutesByProject = new Map<string, number>();
    if (taskTimeEntriesAuthoritative) {
      for (const entry of taskTimeEntries) {
        if (entry.date !== selectedDate) continue;
        taskMinutesByProject.set(
          entry.projectId,
          (taskMinutesByProject.get(entry.projectId) ?? 0) + entry.minutes,
        );
      }
    } else {
      for (const task of shown) {
        taskMinutesByProject.set(
          task.projectId,
          (taskMinutesByProject.get(task.projectId) ?? 0) +
            (task.actualDurationMinutes ?? 0),
        );
      }
    }
    const projectMinutes = Object.fromEntries(
      projects.map((project) => [
        project.id,
        taskMinutesByProject.get(project.id) ?? 0,
      ]),
    );
    await closeDay(selectedDate, actions, projectMinutes);
  };
}
