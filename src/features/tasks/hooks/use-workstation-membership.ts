/**
 * @fileoverview 管理工作站对任务的引用集合，不直接修改任务本身的业务字段。
 */

import type { WorkstationCommand } from '@/lib/workstation-command';

/**
 * 返回工作站成员增删、清空和排序动作；传入的更新器保留原持久化实现。
 */
export function useWorkstationMembership(
  updateWorkstationTaskIds: (updater: (current: string[]) => string[]) => void,
  visible: string[] = [],
  command?: (command: WorkstationCommand) => void,
) {
  /** 切换引用集合，不触碰任务的日期、完成状态或优先级。 */
  const toggleWorkstationTask = (taskId: string) =>
    command
      ? command({ type: visible.includes(taskId) ? 'remove' : 'add', id: taskId })
      : updateWorkstationTaskIds((current) =>
          current.includes(taskId)
            ? current.filter((id) => id !== taskId)
            : [...current, taskId],
        );

  /** 清空工作站仅清空引用集合。 */
  const clearWorkstation = () =>
    command
      ? command({ type: 'clear', ids: [...visible] })
      : updateWorkstationTaskIds(() => []);

  /** 仅调整引用顺序，不改变 Task 内容。 */
  const reorderWorkstation = (sourceId: string, targetId: string) =>
    command
      ? command({
          type: 'move',
          id: sourceId,
          anchor: targetId,
          after: visible.indexOf(sourceId) < visible.indexOf(targetId),
        })
      : updateWorkstationTaskIds((current) => {
          const sourceIndex = current.indexOf(sourceId);
          const targetIndex = current.indexOf(targetId);
          if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex)
            return current;
          const next = [...current];
          next.splice(sourceIndex, 1);
          next.splice(targetIndex, 0, sourceId);
          return next;
        });

  return { clearWorkstation, reorderWorkstation, toggleWorkstationTask };
}
