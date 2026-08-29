/**
 * @fileoverview 封装任务状态流转、移期和历史记录副作用，不负责界面弹窗状态。
 */

import type { Dispatch, SetStateAction } from 'react';
import { canTransitionTask } from '@/lib/task-rules';
import type { AnnotationStroke, HistoryEvent, Task, TaskStatus } from '@/types/domain';

/**
 * 返回既有任务更新与状态流转动作；调用方继续拥有 Dialog 的打开和关闭状态。
 */
export function useTaskWorkflow({
  tasks,
  selectedDate,
  updateTasks,
  updateHistory,
  updateAnnotationStrokes,
  updateWorkstationTaskIds,
}: {
  tasks: Task[];
  selectedDate: string;
  updateTasks: Dispatch<SetStateAction<Task[]>>;
  updateHistory: Dispatch<SetStateAction<HistoryEvent[]>>;
  updateAnnotationStrokes: Dispatch<SetStateAction<AnnotationStroke[]>>;
  updateWorkstationTaskIds: Dispatch<SetStateAction<string[]>>;
}) {
  /** 用同一任务身份替换集合中的记录。 */
  const updateTask = (task: Task) =>
    updateTasks((current) => current.map((item) => (item.id === task.id ? task : item)));

  /** 以既有 newest-first 顺序追加领域历史。 */
  const appendHistory = (
    type: string,
    taskId?: string,
    payload: Record<string, string> = {},
  ) =>
    updateHistory((current) => [
      {
        id: crypto.randomUUID(),
        taskId,
        type,
        occurredAt: new Date().toISOString(),
        payload,
      },
      ...current,
    ]);

  /** 迁移任务到指定状态，并保留删除与放弃的既有副作用。 */
  const moveTask = (id: string, status: TaskStatus) => {
    const task = tasks.find((item) => item.id === id);
    if (!task || !canTransitionTask(task, status)) return;
    if (status === 'trashed') {
      updateAnnotationStrokes((current) =>
        current.filter((stroke) => stroke.targetTaskId !== id),
      );
      updateWorkstationTaskIds((current) => current.filter((taskId) => taskId !== id));
    }
    updateTasks((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              date: status === 'active' ? item.date : undefined,
              postponedFrom:
                status !== 'active' ? (item.date ?? item.postponedFrom) : item.postponedFrom,
              abandonedAt: status === 'abandoned' ? new Date().toISOString() : item.abandonedAt,
              deletedAt: status === 'trashed' ? new Date().toISOString() : item.deletedAt,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    appendHistory(status, id, { fromDate: task.date ?? selectedDate });
  };

  /**
   * 将未完成任务移期到未来日期；跨状态校验和历史字段保持原有语义。
   */
  const rescheduleTask = (task: Task | undefined, targetDate: string) => {
    if (!task) return undefined;
    if (!canTransitionTask(task, 'rescheduled')) return '请先取消完成再移期';
    const sourceDate = task.date ?? selectedDate;
    if (targetDate <= sourceDate) return '请选择晚于原计划日期的未来日期';
    updateTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status: 'active',
              date: targetDate,
              completed: false,
              completedAt: undefined,
              postponedFrom: sourceDate,
              postponedTo: targetDate,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    appendHistory('rescheduled', task.id, { fromDate: sourceDate, toDate: targetDate });
    return undefined;
  };

  return { appendHistory, moveTask, rescheduleTask, updateTask };
}
