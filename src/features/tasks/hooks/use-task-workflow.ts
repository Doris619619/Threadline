/**
 * @fileoverview 封装任务状态流转、移期和历史记录副作用，不负责界面弹窗状态。
 */

import type { Dispatch, SetStateAction } from 'react';
import { canTransitionTask, validatePlanningDate } from '@/lib/task-rules';
import type { AnnotationStroke, Task, TaskStatus } from '@/types/domain';

/**
 * 返回既有任务更新与状态流转动作；调用方继续拥有 Dialog 的打开和关闭状态。
 */
export function useTaskWorkflow({
  tasks,
  selectedDate,
  updateTasks,
  updateAnnotationStrokes,
  updateWorkstationTaskIds,
  transitionTask,
}: {
  tasks: Task[];
  selectedDate: string;
  updateTasks: Dispatch<SetStateAction<Task[]>>;
  updateAnnotationStrokes: Dispatch<SetStateAction<AnnotationStroke[]>>;
  updateWorkstationTaskIds: Dispatch<SetStateAction<string[]>>;
  transitionTask: (
    taskId: string,
    transition: 'scheduled' | 'rescheduled' | 'waiting' | 'abandoned' | 'trashed',
    targetDate?: string,
  ) => Promise<Task>;
}) {
  /** 用同一任务身份替换集合中的记录。 */
  const updateTask = (task: Task) =>
    updateTasks((current) =>
      current.map((item) => (item.id === task.id ? task : item)),
    );

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
    if (status === 'active') {
      updateTask({
        ...task,
        status: 'active',
        date: selectedDate,
        schedulePendingTime: true,
        plannedStartTime: undefined,
        plannedEndTime: undefined,
        completed: false,
        completedAt: undefined,
        deletedAt: undefined,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    void transitionTask(id, status).catch(() => undefined);
  };

  /**
   * 将未完成任务改到今天或未来日期，等待提交后返回；跨状态校验和历史字段保持原有语义。
   */
  const rescheduleTask = async (task: Task | undefined, targetDate: string) => {
    if (!task) return undefined;
    if (!canTransitionTask(task, 'rescheduled')) return '请先取消完成再移期';
    const message = validatePlanningDate(targetDate, task.date);
    if (message) return message;
    try {
      await transitionTask(task.id, 'rescheduled', targetDate);
    } catch (error) {
      return error instanceof Error ? error.message : '改期失败，请重试。';
    }
    return undefined;
  };

  return { moveTask, rescheduleTask, updateTask };
}
