import type { DailyInstance, Task } from '@/types/domain';

export function isEffectiveTask(task: Task): boolean {
  return task.status !== 'abandoned' && task.status !== 'trashed';
}
export function calculateDuration(start?: string, end?: string): number | undefined {
  if (!start || !end || end < start) return undefined;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - sh * 60 - sm;
}
export function isDailyComplete(
  instance: DailyInstance,
  childCompleted: boolean,
): boolean {
  return instance.completed || childCompleted;
}
