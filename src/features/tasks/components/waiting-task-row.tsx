/** @fileoverview 渲染待安排任务行，收敛为安排、删除与主体详细编辑三类交互。 */

'use client';

import { CalendarDays, MoreHorizontal, Trash2 } from 'lucide-react';
import { formatEstimate } from '../task-time';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ProjectTag } from '@/components/ui/project-tag';
import { addLocalDateDays, getLocalDateKey } from '@/lib/local-date';
import type { Project, Task } from '@/types/domain';

/** 保持待安排行紧凑，并将详细编辑入口放在任务主体而非更多菜单。 */
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
  onComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onEdit: () => void;
  onSchedule: (taskId: string, date: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const project = projects.find((item) => item.id === task.projectId);
  const today = getLocalDateKey();
  const tomorrow = addLocalDateDays(today, 1);
  return (
    <div className="waiting-task-row">
      <Checkbox
        aria-label={`完成${task.title}`}
        checked={false}
        onChange={() => onComplete(task.id)}
      />
      <button type="button" className="waiting-task-main" onClick={onEdit}>
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
          aria-label={`${task.title}更多操作`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <MoreHorizontal size={18} />
        </button>
        {menuOpen && (
          <div className="waiting-task-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => onSchedule(task.id, today)}
            >
              <CalendarDays size={15} /> 安排到今天
            </button>
            <button type="button" role="menuitem" onClick={() => setDateOpen(true)}>
              <CalendarDays size={15} /> 安排到其他日期…
            </button>
            <hr />
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => onDelete(task.id)}
            >
              <Trash2 size={15} /> 删除
            </button>
          </div>
        )}
      </div>
      {dateOpen && (
        <div className="waiting-date-backdrop" role="presentation">
          <form
            className="waiting-date-sheet"
            onSubmit={(event) => {
              event.preventDefault();
              const date = String(new FormData(event.currentTarget).get('date') ?? '');
              if (date) onSchedule(task.id, date);
              setDateOpen(false);
              setMenuOpen(false);
            }}
          >
            <h3>安排到其他日期</h3>
            <input
              aria-label="安排日期"
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
        </div>
      )}
    </div>
  );
}
