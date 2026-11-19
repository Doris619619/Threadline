/** @fileoverview 规划任务行：项目与预计信息、完成勾选、编辑与显式安排操作。 */
'use client';
import { useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { TaskActionsPopover } from '@/features/tasks/components/task-actions-popover';
import { useTaskMenu } from '@/features/tasks/hooks/use-task-menu';
import { getLocalDateKey } from '@/lib/local-date';
import { ProjectTag } from '@/components/ui/project-tag';
import type { Project, Task } from '@/types/domain';

/** 保留长标题和原写操作；更多菜单复用顶层定位、键盘与关闭归焦，不改变安排规则。 */
export function PlanningTaskRow({
  task,
  projects,
  disabled,
  targetDate,
  onEdit,
  onComplete,
  onReschedule,
  onWaiting,
  onSchedule,
}: {
  task: Task;
  projects: Project[];
  disabled: boolean;
  targetDate: string;
  onEdit: () => void;
  onComplete: () => void;
  onReschedule: () => void;
  onWaiting: () => void;
  onSchedule: () => void;
}) {
  const project = projects.find((item) => item.id === task.projectId);
  const waiting = task.status === 'waiting';
  const menu = useTaskMenu();
  const anchor = useRef<HTMLButtonElement>(null);
  const canOpen = !waiting && !task.completed && !disabled;
  return (
    <div
      className="planning-task"
      data-completed={task.completed}
      onContextMenu={canOpen ? menu.onContextMenu : undefined}
      onKeyDown={canOpen ? menu.onKeyDown : undefined}
    >
      {!waiting && (
        <label className="planning-check">
          <input
            type="checkbox"
            checked={task.completed}
            disabled={disabled}
            aria-label={`${task.completed ? '取消完成' : '完成'}${task.title}`}
            onChange={onComplete}
          />
        </label>
      )}
      <button
        className="planning-task-main"
        onClick={(event) => {
          event.currentTarget.focus();
          onEdit();
        }}
        disabled={disabled}
      >
        <span className="planning-task-title">
          {task.plannedStartTime && (
            <time>
              {task.plannedStartTime}
              {task.plannedEndTime && `–${task.plannedEndTime}`}
            </time>
          )}
          <span>{task.title}</span>
        </span>
        <span className="planning-task-meta">
          {project && <ProjectTag name={project.name} color={project.color} />}
          <span>
            {task.plannedDurationMinutes === undefined
              ? '未估时'
              : `预计 ${task.plannedDurationMinutes} 分钟`}
          </span>
        </span>
      </button>
      {waiting ? (
        <button
          className="planning-schedule"
          disabled={disabled || targetDate < getLocalDateKey()}
          onClick={(event) => {
            event.currentTarget.focus();
            onSchedule();
          }}
        >
          安排到 {Number(targetDate.slice(5, 7))}/{Number(targetDate.slice(8))}
        </button>
      ) : (
        !task.completed && (
          <>
            <button
              ref={anchor}
              type="button"
              className="planning-task-menu-trigger"
              aria-label={`${task.title}更多操作`}
              aria-haspopup="menu"
              aria-expanded={menu.open}
              disabled={disabled}
              onClick={menu.toggle}
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </button>
            {menu.open && (
              <TaskActionsPopover
                anchor={anchor}
                point={menu.point}
                className="planning-task-menu"
                role="menu"
                label={`${task.title}日历操作`}
                onClose={menu.close}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.currentTarget.focus();
                    menu.close();
                    onReschedule();
                  }}
                  disabled={disabled}
                >
                  调整日期…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    menu.close();
                    onWaiting();
                  }}
                  disabled={disabled}
                >
                  移到待安排
                </button>
              </TaskActionsPopover>
            )}
          </>
        )
      )}
    </div>
  );
}
