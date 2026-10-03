/** @fileoverview 从任务菜单打开的短计时设置；桌面居中、手机使用现有底部表单与焦点保护。 */
'use client';
import { useState } from 'react';
import { ManagementDialog } from '@/components/ui/management-dialog';
import type { Task } from '@/types/domain';

/** 绑定原任务只选择模式与分钟；开始前由全局计时会话复核任务有效性和三项上限。 */
export function TaskTimerDialog({
  task,
  onClose,
  onStart,
}: {
  task: Task;
  onClose: () => void;
  onStart: (mode: 'up' | 'down', minutes: number) => string | undefined;
}) {
  const [mode, setMode] = useState<'up' | 'down'>('up');
  const [duration, setDuration] = useState(String(task.plannedDurationMinutes || 25));
  const [error, setError] = useState('');
  /** 倒计时限定 1—1440 整数分钟；提交失败留在设置中，成功才收起。 */
  function start(event: React.FormEvent) {
    event.preventDefault();
    const minutes = Number(duration);
    if (mode === 'down' && (!/^\d+$/.test(duration) || minutes < 1 || minutes > 1440)) {
      setError('请输入 1—1440 的整数分钟。');
      return;
    }
    const failure = onStart(mode, mode === 'down' ? minutes : 25);
    if (failure) setError(failure);
    else onClose();
  }
  return (
    <ManagementDialog
      title="加入计时"
      className="task-timer-dialog"
      onClose={onClose}
      error={error}
    >
      <form className="task-timer-form" onSubmit={start}>
        <strong className="task-timer-selected-title">{task.title}</strong>
        <label>
          计时方式
          <select
            data-management-initial-focus
            value={mode}
            onChange={(event) => setMode(event.target.value as 'up' | 'down')}
          >
            <option value="up">正计时</option>
            <option value="down">倒计时</option>
          </select>
        </label>
        {mode === 'down' && (
          <label>
            倒计时分钟
            <input
              inputMode="numeric"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </label>
        )}
        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit">开始计时</button>
        </footer>
      </form>
    </ManagementDialog>
  );
}
