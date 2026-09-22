/** @fileoverview 显式列举任务可编辑字段，基于打开时原值生成细粒度更新意图。 */
import type { Task } from '@/types/domain';
export const taskEditableFields = [
  'title',
  'projectId',
  'schedulePendingTime',
  'plannedStartTime',
  'plannedEndTime',
  'plannedDurationMinutes',
  'actualDurationMinutes',
  'completed',
  'importance',
] as const;
export type TaskPatch = Partial<Pick<Task, (typeof taskEditableFields)[number]>>;
/** undefined 也表示显式清空；元数据与工作流状态不参与表单补丁。 */
export function taskFieldChanges(next: Task, original: Task): TaskPatch {
  return Object.fromEntries(
    taskEditableFields
      .filter((key) => next[key] !== original[key])
      .map((key) => [key, next[key]]),
  );
}
