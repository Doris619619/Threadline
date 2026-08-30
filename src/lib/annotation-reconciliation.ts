/** @fileoverview 按云端全部 task identity 集合清理本机已删除、已 purge 或 trashed 任务的 Annotation。 */

import type { AnnotationStroke, Task } from '@/types/domain';

/**
 * 保留日期/全局笔迹和仍存在的非 trashed 任务笔迹；输入必须是 owner 的 authoritative all-task query。
 */
export function reconcileTaskAnnotations(
  strokes: AnnotationStroke[],
  authoritativeTasks: Task[],
): AnnotationStroke[] {
  const tasks = new Map(authoritativeTasks.map((task) => [task.id, task]));
  return strokes.filter((stroke) => {
    if (!stroke.targetTaskId) return true;
    const target = tasks.get(stroke.targetTaskId);
    return Boolean(target && target.status !== 'trashed');
  });
}
