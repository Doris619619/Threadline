/** @fileoverview 把每日收尾表单转换成单次原子 close_day 命令，不拆分写入业务表。 */

import type { Daily } from '@/features/daily/types';
import type { Project, Task } from '@/types/domain';

type CloseAction = {
  taskId: string;
  action: 'tomorrow' | 'date' | 'backlog' | 'abandoned';
  targetDate?: string;
};

/** 保持既有 FormData 和项目工时口径，并把全部副作用交给数据库事务。 */
export function useCloseDay({
  closeDay,
  daily,
  projects,
  selectedDate,
  shown,
  tomorrow,
}: {
  closeDay: (
    date: string,
    actions: CloseAction[],
    projectMinutes: Record<string, number>,
  ) => Promise<void>;
  daily: Daily[];
  projects: Project[];
  selectedDate: string;
  shown: Task[];
  tomorrow: string;
}) {
  return (form: FormData) => {
    const actions = shown.flatMap<CloseAction>((task) => {
      const rawAction = form.get(`action-${task.id}`);
      if (!rawAction || task.completed) return [];
      const action = String(rawAction) as CloseAction['action'];
      const selectedTarget = String(form.get(`date-${task.id}`) ?? '');
      const targetDate = action === 'tomorrow' ? tomorrow : selectedTarget || undefined;
      return [{ taskId: task.id, action, targetDate }];
    });
    const projectMinutes = Object.fromEntries(
      projects.map((project) => [
        project.id,
        shown
          .filter((task) => task.projectId === project.id)
          .reduce((total, task) => total + (task.actualDurationMinutes ?? 0), 0) +
          daily
            .filter((item) => item.projectId === project.id)
            .reduce((total, item) => total + item.actual, 0),
      ]),
    );
    void closeDay(selectedDate, actions, projectMinutes).catch(() => undefined);
  };
}
