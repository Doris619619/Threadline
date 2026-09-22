/** @fileoverview 显式列举任务可编辑字段，基于打开时原值生成细粒度更新意图。 */
import type { Task } from '@/types/domain';

/** 保留冲突类别，供队列停止旧意图；显示文本不承担错误分类职责。 */
export class TaskConflictError extends Error {
  constructor() {
    super('任务已在其他设备修改，请重新查看后保存。草稿已保留。');
    this.name = 'TaskConflictError';
  }
}

/** 兼容直接传递的数据库错误；不把普通网络失败误当成字段冲突。 */
export function isTaskConflict(error: unknown): boolean {
  return (
    error instanceof TaskConflictError ||
    (error instanceof Error && error.message.includes('TASK_FIELD_CONFLICT'))
  );
}

export type TaskConflictDraft = { original: Task; draft: Task };
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
