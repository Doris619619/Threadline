/** @fileoverview 本地演示按显式日期调整实际账本，与云端增量、固定历史和任务累计字段保持一致。 */
import type { Task, TaskTimeEntry } from '@/types/domain';
import { parseLocalDateKey } from './local-date';

/** 返回新账本而不改输入；减少实际仅能扣减所选日期的投入，不能吞掉其他日期历史。 */
export function adjustTaskActualEntries(
  task: Task,
  minutes: number | undefined,
  date: string,
  entries: TaskTimeEntry[],
): TaskTimeEntry[] {
  parseLocalDateKey(date);
  if (
    minutes !== undefined &&
    (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 2147483647)
  )
    throw new Error('实际耗时请输入有效的非负分钟');
  let rows = entries;
  const previous = task.actualDurationMinutes ?? 0;
  // 兼容没有本地账本的历史演示缓存，只补齐该任务原日期的已知累计投入。
  if (previous > 0 && !rows.some((entry) => entry.taskId === task.id)) {
    rows = [
      ...rows,
      {
        id: 'local-actual-' + task.id,
        taskId: task.id,
        projectId: task.projectId,
        date: task.date ?? task.postponedFrom ?? date,
        minutes: previous,
      },
    ];
  }
  const delta = (minutes ?? 0) - previous;
  if (!delta) return rows;
  const existing = rows.find(
    (entry) => entry.taskId === task.id && entry.date === date,
  );
  if (delta < 0 && (!existing || existing.minutes + delta < 0))
    throw new Error(
      '该日期的实际投入不足，不能减少其他日期的历史记录。请选择原投入日期。',
    );
  return existing
    ? rows.map((entry) =>
        entry.id === existing.id ? { ...entry, minutes: entry.minutes + delta } : entry,
      )
    : [
        ...rows,
        {
          id: 'local-actual-' + task.id + '-' + date,
          taskId: task.id,
          projectId: task.projectId,
          date,
          minutes: delta,
        },
      ];
}
