/**
 * @fileoverview 渲染待安排任务队列，并保持当前的重要性、DDL 与状态流转动作。
 */

import { Input } from '@/components/ui/input';
import { ProjectTag } from '@/components/ui/project-tag';
import { Surface } from '@/components/ui/surface';
import { resolveTaskProject } from '@/lib/project-rules';
import type { Project, Task, TaskStatus } from '@/types/domain';
export function PlanningQueue({
  tasks,
  projects,
  onUpdate,
  onMove,
  onArrange,
}: {
  tasks: Task[];
  projects: Project[];
  onUpdate: (task: Task) => void;
  onMove: (id: string, status: TaskStatus) => void;
  onArrange: (id: string) => void;
}) {
  return (
    <Surface className="planning-queue">
      <header>
        <h2>待安排</h2>
        <span>重要 / 不重要 · DDL 可选</span>
      </header>
      {tasks.length === 0 ? (
        <p>还没有待安排事项。任务选择“待安排”后会出现在这里。</p>
      ) : (
        tasks.map((task) => {
          const project = resolveTaskProject(projects, task.projectId);
          return (
            <div className="queue-row" key={task.id}>
              <ProjectTag
                name={project?.name ?? '未配置项目'}
                color={project?.color ?? '#8793a7'}
              />
              <b>{task.title}</b>
              <select
                aria-label={`${task.title}重要性`}
                value={task.backlogImportance ?? 'important'}
                onChange={(event) =>
                  onUpdate({
                    ...task,
                    backlogImportance: event.target.value as
                      'important' | 'not_important',
                  })
                }
              >
                <option value="important">重要</option>
                <option value="not_important">不重要</option>
              </select>
              <Input
                aria-label={`${task.title} DDL`}
                type="datetime-local"
                value={task.ddlAt ?? ''}
                onChange={(event) =>
                  onUpdate({ ...task, ddlAt: event.target.value || undefined })
                }
              />
              <button onClick={() => onArrange(task.id)}>安排到今天</button>
              {!task.completed && (
                <button onClick={() => onMove(task.id, 'abandoned')}>放弃</button>
              )}
              <button onClick={() => onMove(task.id, 'trashed')}>删除</button>
            </div>
          );
        })
      )}
    </Surface>
  );
}
/**
 * 任务单行组件（支持时间线视图、无时间待办与持久化的待填时间状态）。
 */
