/**
 * @fileoverview 组合任务仪表盘的派生数据与独立交互 Hook，不承载创建或编辑实现。
 */

import { useState } from 'react';
import { useScheduleResize } from '@/features/tasks/hooks/use-schedule-resize';
import { useTaskDashboardData } from '@/features/tasks/hooks/use-task-dashboard-data';
import { useTaskDragAndDrop } from '@/features/tasks/hooks/use-task-drag-and-drop';
import { useTaskWorkflow } from '@/features/tasks/hooks/use-task-workflow';
import { useWorkstationMembership } from '@/features/tasks/hooks/use-workstation-membership';
import type { AnnotationStroke, Task } from '@/types/domain';

type DataInput = Parameters<typeof useTaskDashboardData>[0];

/** 仅组合 Dashboard 所需的读取、工作流、拖拽、resize 和工作站动作。 */
export function useTaskDashboardController({
  interactionLocked,
  updateAnnotationStrokes,
  updateTasks,
  updateWorkstationTaskIds,
  transitionTask,
  ...dataInput
}: DataInput & {
  interactionLocked: boolean;
  updateAnnotationStrokes: React.Dispatch<React.SetStateAction<AnnotationStroke[]>>;
  updateTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  updateWorkstationTaskIds: React.Dispatch<React.SetStateAction<string[]>>;
  transitionTask: (
    taskId: string,
    transition: 'scheduled' | 'rescheduled' | 'backlog' | 'abandoned' | 'trashed',
    targetDate?: string,
  ) => Promise<Task>;
}) {
  const data = useTaskDashboardData(dataInput);
  const workflow = useTaskWorkflow({
    selectedDate: dataInput.selectedDate,
    tasks: dataInput.tasks,
    updateAnnotationStrokes,
    updateTasks,
    updateWorkstationTaskIds,
    transitionTask,
  });
  const workstation = useWorkstationMembership(updateWorkstationTaskIds);
  const resize = useScheduleResize();
  const [autoFocusTimeTaskId, setAutoFocusTimeTaskId] = useState<string | null>(null);

  /** 将无时间任务移到日程，并保留原有的待填时间和焦点行为。 */
  const moveTaskToSchedule = (taskId: string) => {
    const task = data.shown.find((item) => item.id === taskId);
    if (!task || task.plannedStartTime || task.schedulePendingTime) return;
    workflow.updateTask({
      ...task,
      schedulePendingTime: true,
      plannedStartTime: undefined,
      plannedEndTime: undefined,
      plannedDurationMinutes: undefined,
      updatedAt: new Date().toISOString(),
    });
    setAutoFocusTimeTaskId(taskId);
  };

  /** 将日程任务移回无时间待办，并清理所有排程字段。 */
  const moveTaskToQuick = (taskId: string) => {
    const task = data.shown.find((item) => item.id === taskId);
    if (!task) return;
    workflow.updateTask({
      ...task,
      schedulePendingTime: false,
      plannedStartTime: undefined,
      plannedEndTime: undefined,
      plannedDurationMinutes: undefined,
      updatedAt: new Date().toISOString(),
    });
  };

  const dragAndDrop = useTaskDragAndDrop({
    interactionLocked,
    onMoveToQuick: moveTaskToQuick,
    onMoveToSchedule: moveTaskToSchedule,
  });

  return {
    ...data,
    ...dragAndDrop,
    ...resize,
    ...workflow,
    ...workstation,
    autoFocusTimeTaskId,
    setAutoFocusTimeTaskId,
  };
}
