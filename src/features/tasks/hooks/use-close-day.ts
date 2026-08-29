/** @fileoverview 封装每日收尾的任务、Daily、历史与项目工时写入，不持有 Dialog。 */

import type { Dispatch, SetStateAction } from 'react';
import type { Daily, DailyHistoryEntry } from '@/features/daily/types';
import type { CloseRecord, HistoryEvent, Project, Task } from '@/types/domain';

/** 保持收尾 FormData 字段、任务流转和历史写入顺序的既有业务语义。 */
export function useCloseDay({
  daily,
  projects,
  selectedDate,
  shown,
  tomorrow,
  updateCloseRecords,
  updateDailyHistory,
  updateHistory,
  updateTasks,
}: {
  daily: Daily[];
  projects: Project[];
  selectedDate: string;
  shown: Task[];
  tomorrow: string;
  updateCloseRecords: Dispatch<SetStateAction<CloseRecord[]>>;
  updateDailyHistory: Dispatch<SetStateAction<DailyHistoryEntry[]>>;
  updateHistory: Dispatch<SetStateAction<HistoryEvent[]>>;
  updateTasks: Dispatch<SetStateAction<Task[]>>;
}) {
  return (form: FormData) => {
    const events: HistoryEvent[] = [];
    updateTasks((current) => current.map((task) => {
      const action = form.get(`action-${task.id}`);
      if (!action || task.completed) return task;
      const target = String(form.get(`date-${task.id}`) ?? '');
      events.push({ id: crypto.randomUUID(), taskId: task.id, type: `close_${action}`, occurredAt: new Date().toISOString(), payload: { fromDate: selectedDate, ...(action === 'tomorrow' ? { toDate: tomorrow } : {}), ...(action === 'date' && target ? { toDate: target } : {}) } });
      if (action === 'tomorrow') return { ...task, date: tomorrow, status: 'active', postponedFrom: selectedDate, postponedTo: tomorrow };
      if (action === 'backlog') return { ...task, status: 'backlog', date: undefined };
      if (action === 'abandoned') return { ...task, status: 'abandoned', abandonedAt: new Date().toISOString() };
      return target ? { ...task, date: target, status: 'active', postponedFrom: selectedDate, postponedTo: target } : task;
    }));
    updateHistory((current) => [...events, ...current]);
    updateDailyHistory((current) => [...daily.filter((item) => !current.some((entry) => entry.dailyId === item.id && entry.date === selectedDate)).map((item) => ({ dailyId: item.id, projectId: item.projectId, date: selectedDate, completed: item.completed || item.children.some((child) => child.completed), actual: item.actual, result: item.result })), ...current]);
    const projectMinutes = Object.fromEntries(projects.map((project) => [project.id, shown.filter((task) => task.projectId === project.id).reduce((total, task) => total + (task.actualDurationMinutes ?? 0), 0) + daily.filter((item) => item.projectId === project.id).reduce((total, item) => total + item.actual, 0)]));
    updateCloseRecords((current) => [...current.filter((record) => record.date !== selectedDate), { id: crypto.randomUUID(), date: selectedDate, closedAt: new Date().toISOString(), projectMinutes }]);
  };
}
