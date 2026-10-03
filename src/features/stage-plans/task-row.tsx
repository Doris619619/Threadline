/** @fileoverview 阶段和项目共用同一 Task 行；轻量安排、完成与菜单操作不复制任务。 */
'use client';
import { useRef, type ReactNode } from 'react';
import { useTaskMenu } from '@/features/tasks/hooks/use-task-menu';
import { TaskTimerMenuAction } from '@/features/tasks/components/task-timer-menu-action';
import { MoreHorizontal } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ProjectTag } from '@/components/ui/project-tag';
import { TaskActionsPopover } from '@/features/tasks/components/task-actions-popover';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import type { Project, Task } from '@/types/domain';
import { stageTaskDateLabel } from './rules';
/** 项目与标题首行并排；直接操作有独立忙状态和错误，长标题完整换行。 */
export function PlanTaskRow({
  task,
  today,
  onEdit,
  onDate,
  onToday,
  onToggle,
  onRemove,
  metadata,
  project,
  estimate,
  onSelect,
  onHover,
  selected = false,
  disabled = false,
}: {
  task: Task;
  today: string;
  onEdit: () => void;
  onDate: () => void;
  onToday: () => Promise<void>;
  onToggle: () => Promise<unknown>;
  onRemove?: () => Promise<void>;
  metadata?: ReactNode;
  project?: Project;
  estimate?: ReactNode;
  onSelect?: () => void;
  onHover?: (hovered: boolean) => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const menu = useTaskMenu();
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const { busy, error, run } = useGuardedAction();
  return (
    <div
      className={
        'stage-task-row' +
        (task.completed ? ' is-completed' : '') +
        (estimate ? ' has-estimate' : '') +
        (selected ? ' is-selected' : '')
      }
      data-stage-task-id={task.id}
      data-stage-time-task={onSelect ? task.id : undefined}
      aria-busy={busy || disabled}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onContextMenu={menu.onContextMenu}
      onKeyDown={menu.onKeyDown}
    >
      <Checkbox
        checked={task.completed}
        aria-label={(task.completed ? '取消完成 ' : '完成 ') + task.title}
        disabled={busy || disabled}
        onChange={() => void run(onToggle)}
      />
      <div className="plan-task-content">
        <div className="plan-task-title-line">
          {project && (
            <span className="plan-task-project">
              <ProjectTag name={project.name} color={project.color} />
            </span>
          )}
          <button
            className="stage-task-title"
            type="button"
            onClick={onSelect ?? onEdit}
            aria-pressed={onSelect ? selected : undefined}
            onFocus={() => onHover?.(true)}
            onBlur={() => onHover?.(false)}
          >
            {task.title}
          </button>
        </div>
        {metadata && <div className="plan-task-meta">{metadata}</div>}
      </div>
      {estimate && <div className="stage-task-estimate">{estimate}</div>}
      <div className="stage-task-actions">
        {!task.completed && task.status === 'waiting' ? (
          <button
            type="button"
            className="stage-today"
            disabled={busy || disabled}
            onClick={() => void run(onToday)}
          >
            → 今天
          </button>
        ) : (
          !task.completed && (
            <time dateTime={task.date}>{stageTaskDateLabel(task.date, today)}</time>
          )
        )}
        <button
          ref={menuAnchor}
          type="button"
          aria-label={task.title + '更多操作'}
          aria-haspopup="menu"
          aria-expanded={menu.open}
          disabled={busy || disabled}
          onClick={menu.toggle}
        >
          <MoreHorizontal size={17} aria-hidden="true" />
        </button>
        {menu.open && (
          <TaskActionsPopover
            anchor={menuAnchor}
            point={menu.point}
            label={task.title + '任务操作'}
            className="waiting-task-menu"
            role="menu"
            onClose={menu.close}
          >
            {!task.completed && (
              <TaskTimerMenuAction
                taskId={task.id}
                onClose={menu.close}
                role="menuitem"
              />
            )}
            {!task.completed && (
              <button
                type="button"
                role="menuitem"
                disabled={busy || disabled}
                onClick={() => {
                  menu.close();
                  onDate();
                }}
              >
                安排到其他日期
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              disabled={busy || disabled}
              onClick={() => {
                menu.close();
                onEdit();
              }}
            >
              编辑
            </button>
            {onRemove && (
              <button
                type="button"
                role="menuitem"
                disabled={busy || disabled}
                onClick={() => {
                  menu.close();
                  void run(onRemove);
                }}
              >
                从阶段计划移除
              </button>
            )}
          </TaskActionsPopover>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
