/** @fileoverview 阶段时间图右侧唯一任务清单；按项目汇总，状态筛选不改变圆环统计范围。 */
'use client';
import { useState, type ReactNode } from 'react';
import type { Project, Task } from '@/types/domain';
import { formatMinutes } from '@/features/tasks/task-time';
import { stageProjectGroups } from './project-groups';
import type { StageTimeView } from './time-view';
import { softTimeColor } from './time-colors';

const filters = [
  ['all', '全部'],
  ['waiting', '未安排'],
  ['scheduled', '已安排'],
  ['completed', '已完成'],
] as const;

/** 保持原任务顺序和项目排序，已完成任务仍可编辑，总量按当前图表口径计算。 */
export function TimeTaskList({
  tasks,
  projects,
  view,
  renderTask,
}: {
  tasks: Task[];
  projects: Project[];
  view: StageTimeView;
  renderTask: (task: Task) => ReactNode;
}) {
  const [filter, setFilter] = useState('all');
  /** 分类仅用于筛选同一 Task，完成优先于安排状态。 */
  const state = (task: Task) =>
    task.completed ? 'completed' : task.status === 'waiting' ? 'waiting' : 'scheduled';
  const visible = tasks.filter((task) => filter === 'all' || state(task) === filter);
  return (
    <section className="stage-time-task-list" aria-label="项目任务明细">
      <header className="stage-time-list-heading">
        <h3>任务</h3>
        <select
          aria-label="筛选阶段任务状态"
          value={filter}
          disabled={view.saving}
          onChange={(event) => setFilter(event.target.value)}
        >
          {filters.map(([key, label]) => (
            <option key={key} value={key}>
              {label}{' '}
              {tasks.filter((task) => key === 'all' || state(task) === key).length}
            </option>
          ))}
        </select>
      </header>
      {stageProjectGroups(visible, projects).map((group) => (
        <details
          key={group.id}
          className="stage-waiting-project"
          data-stage-project-id={group.id}
          open
        >
          <summary>
            <i
              aria-hidden="true"
              style={{ background: softTimeColor(group.project?.color ?? '#8792a2') }}
            />
            <span>{group.project?.name ?? '未知项目'}</span>
            <small>{group.tasks.length} 项</small>
            <strong>
              {formatMinutes(
                group.tasks.reduce(
                  (sum, task) =>
                    sum +
                    (view.metric === 'remaining' && task.completed
                      ? 0
                      : view.metric === 'actual'
                        ? (task.actualDurationMinutes ?? 0)
                        : (task.plannedDurationMinutes ?? 0)),
                  0,
                ),
              )}
            </strong>
          </summary>
          {group.tasks.map(renderTask)}
        </details>
      ))}
      {!visible.length && <p className="stage-empty-group">暂无任务</p>}
    </section>
  );
}
