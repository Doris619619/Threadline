/** @fileoverview 规划任务行：项目与预计信息、完成勾选、编辑与显式安排操作。 */
import { getLocalDateKey } from '@/lib/local-date';
import { ProjectTag } from '@/components/ui/project-tag';
import type { Project, Task } from '@/types/domain';

/** 保留长标题换行；所有写操作由页面统一等待，失败不丢失原任务。 */
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
  return (
    <div className="planning-task" data-completed={task.completed}>
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
          onClick={onSchedule}
        >
          安排到 {Number(targetDate.slice(5, 7))}/{Number(targetDate.slice(8))}
        </button>
      ) : (
        !task.completed && (
          <details className="planning-actions">
            <summary aria-label={`${task.title}更多操作`}>•••</summary>
            <div>
              <button
                onClick={(event) => {
                  event.currentTarget.focus();
                  onReschedule();
                }}
                disabled={disabled}
              >
                改期
              </button>
              <button onClick={onWaiting} disabled={disabled}>
                退回待安排
              </button>
            </div>
          </details>
        )
      )}
    </div>
  );
}
