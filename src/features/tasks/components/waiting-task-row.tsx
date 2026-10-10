/** @fileoverview 渲染待安排任务行，收敛为安排、删除与主体详细编辑三类交互。 */

'use client';

import { CalendarDays, MoreHorizontal, Trash2 } from 'lucide-react';
import { formatEstimate } from '../task-time';
import { useRef, useState } from 'react';
import { useTaskMenu } from '../hooks/use-task-menu';
import { TaskTimerMenuAction } from './task-timer-menu-action';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { TaskActionsPopover } from './task-actions-popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ProjectTag } from '@/components/ui/project-tag';
import { addLocalDateDays, getLocalDateKey } from '@/lib/local-date';
import type { Project, Task } from '@/types/domain';

/** 待安排主体可编辑，异步动作只锁定控件并保留错误；桌面右键和触屏更多保留安排及计时操作。 */
export function WaitingTaskRow({
  projects,
  task,
  onComplete,
  onDelete,
  onEdit,
  onSchedule,
}: {
  projects: Project[];
  task: Task;
  onComplete: (taskId: string) => Promise<unknown> | void;
  onDelete: (taskId: string) => Promise<unknown> | void;
  onEdit: () => void;
  onSchedule: (taskId: string, date: string) => Promise<unknown> | void;
}) {
  const menu = useTaskMenu();
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const { busy, error, run } = useGuardedAction();
  /** 动作启动即收起菜单；失败保留任务和日期，允许明确重试。 */
  const submit = (action: () => Promise<unknown> | void) => {
    menu.close();
    void run(async () => {
      await action();
      setDateOpen(false);
    });
  };
  const project = projects.find((item) => item.id === task.projectId);
  const today = getLocalDateKey();
  const tomorrow = addLocalDateDays(today, 1);
  return (
    <div
      className="waiting-task-row"
      aria-busy={busy}
      onContextMenu={menu.onContextMenu}
      onKeyDown={menu.onKeyDown}
    >
      <Checkbox
        aria-label={`完成${task.title}`}
        checked={false}
        disabled={busy}
        onChange={() => submit(() => onComplete(task.id))}
      />
      <button
        type="button"
        disabled={busy}
        className="waiting-task-main"
        onClick={onEdit}
      >
        {project && <ProjectTag name={project.name} color={project.color} />}
        <span className="waiting-task-title">
          <span>{task.title}</span>
          <small className="waiting-estimate">
            {' '}
            · {formatEstimate(task.plannedDurationMinutes)}
          </small>
        </span>
      </button>
      <div className="waiting-task-actions">
        <button
          type="button"
          ref={menuAnchor}
          className="task-context-trigger"
          disabled={busy}
          aria-label={`${task.title}更多操作`}
          aria-haspopup="menu"
          aria-expanded={menu.open}
          onClick={menu.toggle}
        >
          <MoreHorizontal size={18} />
        </button>
        {menu.open && (
          <TaskActionsPopover
            anchor={menuAnchor}
            point={menu.point}
            label={`${task.title}待安排操作`}
            className="waiting-task-menu"
            role="menu"
            onClose={menu.close}
          >
            <TaskTimerMenuAction
              taskId={task.id}
              onClose={menu.close}
              role="menuitem"
            />
            <button
              type="button"
              role="menuitem"
              onClick={() => submit(() => onSchedule(task.id, today))}
            >
              <CalendarDays size={15} /> 安排到今天
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                menu.close();
                setDateOpen(true);
              }}
            >
              <CalendarDays size={15} /> 安排到其他日期…
            </button>
            <hr />
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => submit(() => onDelete(task.id))}
            >
              <Trash2 size={15} /> 删除
            </button>
          </TaskActionsPopover>
        )}
      </div>
      {dateOpen && (
        <ManagementDialog
          title="安排到其他日期"
          busy={busy}
          error={error}
          onClose={() => setDateOpen(false)}
        >
          <form
            className="waiting-date-sheet"
            onSubmit={(event) => {
              event.preventDefault();
              const date = String(new FormData(event.currentTarget).get('date') ?? '');
              if (date) submit(() => onSchedule(task.id, date));
            }}
          >
            <input
              aria-label="安排日期"
              data-management-initial-focus
              name="date"
              type="date"
              min={tomorrow}
              defaultValue={tomorrow}
            />
            <footer>
              <button type="button" onClick={() => setDateOpen(false)}>
                取消
              </button>
              <button type="submit">安排</button>
            </footer>
          </form>
        </ManagementDialog>
      )}
      {error && !dateOpen && (
        <small className="form-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
