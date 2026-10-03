/** @fileoverview 任务更多菜单中的加入计时动作；统一重复任务、三个上限和加载时的禁用状态。 */
'use client';
import { Timer } from 'lucide-react';
import { useTaskTimerActions } from '../task-timer-context';

/** 打开指定原 Task 的计时设置，已有计时或满额时不给出第二个启动入口。 */
export function TaskTimerMenuAction({
  taskId,
  onClose,
  role,
}: {
  taskId: string;
  onClose: () => void;
  role?: 'menuitem';
}) {
  const actions = useTaskTimerActions();
  if (!actions) return null;
  const included = actions.taskIds.includes(taskId);
  const full = actions.taskIds.length >= 3;
  return (
    <button
      type="button"
      role={role}
      disabled={!actions.ready || included || full}
      onClick={() => {
        onClose();
        actions.request(taskId);
      }}
    >
      <Timer size={16} aria-hidden="true" />
      {included ? '已加入计时' : full ? '最多三个计时器' : '加入计时'}
    </button>
  );
}
