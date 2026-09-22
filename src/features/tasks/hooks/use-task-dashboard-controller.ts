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
  runWorkstationCommand,
  workstationTaskIds,
  transitionTask,
  ...dataInput
}: DataInput & {
  interactionLocked: boolean;
  workstationTaskIds: string[];
  runWorkstationCommand?: (
    command: import('@/lib/workstation-command').WorkstationCommand,
  ) => void;
  updateAnnotationStrokes: React.Dispatch<React.SetStateAction<AnnotationStroke[]>>;
  updateTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  updateWorkstationTaskIds: React.Dispatch<React.SetStateAction<string[]>>;
  transitionTask: (
    taskId: string,
    transition: 'scheduled' | 'rescheduled' | 'waiting' | 'abandoned' | 'trashed',
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
  const workstation = useWorkstationMembership(
    updateWorkstationTaskIds,
    workstationTaskIds,
    runWorkstationCommand,
  );
  const resize = useScheduleResize();
  const [autoFocusTimeTaskId, setAutoFocusTimeTaskId] = useState<string | null>(null);

  /** 将待安排任务原子安排到当前所选业务日，并只在成功返回后聚焦时间。 */
  const moveTaskToSchedule = (taskId: string) => {
    const task = data.waiting.find((item) => item.id === taskId);
    if (!task) return;
    void transitionTask(taskId, 'scheduled', dataInput.selectedDate)
      .then(() => setAutoFocusTimeTaskId(taskId))
      .catch(() => undefined);
  };

  /** 将日程任务原子移入持续待安排池。 */
  const moveTaskToWaiting = (taskId: string) => {
    const task = data.shown.find((item) => item.id === taskId);
    if (!task) return;
    void transitionTask(taskId, 'waiting').catch(() => undefined);
  };

  const dragAndDrop = useTaskDragAndDrop({
    interactionLocked,
    onMoveToWaiting: moveTaskToWaiting,
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
