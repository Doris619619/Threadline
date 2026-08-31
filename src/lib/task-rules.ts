/** @fileoverview 提供任务状态转换与 Daily/时长的纯领域规则，避免 UI 绕过状态约束。 */

import type { DailyInstance, Task, TaskStatus } from '@/types/domain';

/** 判断任务是否计入当前普通任务统计。 */
export function isEffectiveTask(task: Task): boolean {
  return task.status !== 'abandoned' && task.status !== 'trashed';
}
/** 根据同日开始和结束时间计算预计分钟；无效或跨日输入不产生时长。 */
export function calculateDuration(start?: string, end?: string): number | undefined {
  if (!start || !end || end < start) return undefined;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - sh * 60 - sm;
}
/** Daily 父完成独立于子项；child completion 仅表示该 breakdown 已完成。 */
export function isDailyComplete(
  instance: DailyInstance,
  childCompleted: boolean,
): boolean {
  void childCompleted;
  return instance.completed;
}

/**
 * 限制已完成任务进入待安排、放弃和移期等未完成流转；删除仍是允许的独立数据生命周期操作。
 */
export function canTransitionTask(task: Task, nextStatus: TaskStatus): boolean {
  return !task.completed || nextStatus === 'trashed';
}
