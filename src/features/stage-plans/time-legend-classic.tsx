/** @fileoverview 经典版右侧简明明细：项目总量、任务色点与时长，预计支持单框原地编辑。 */
'use client';
import type { Task } from '@/types/domain';
import { formatMinutes } from '@/features/tasks/task-time';
import type { StageTimeGroup } from './time-breakdown';
import type { StageTimeView } from './time-view';
import { TaskEstimateEditor } from './task-estimate-editor';

/** 经典明细提供项目与任务的等价选择按钮；项目选择不触发旁边的原生清单折叠。 */
export function ClassicTimeLegend({
  groups,
  tasks,
  today,
  view,
  hidden,
}: {
  groups: StageTimeGroup[];
  tasks: Task[];
  today: string;
  view: StageTimeView;
  hidden: boolean;
}) {
  return (
    <div
      className="stage-time-legend stage-time-classic-legend"
      aria-label="项目时间明细"
      hidden={hidden}
    >
      {groups.map((group) => (
        <div key={group.id} className="stage-time-classic-group">
          <button
            type="button"
            className="stage-time-project-select"
            aria-label={'查看 ' + group.name + ' 项目时间'}
            aria-pressed={view.selected === group.id}
            onFocus={() => view.hover(group.id)}
            onBlur={() => view.hover(undefined)}
            onMouseEnter={() => view.hover(group.id)}
            onMouseLeave={() => view.hover(undefined)}
            onClick={() => view.select(group.id)}
          >
            <i aria-hidden="true" style={{ background: group.color }} />
            <span>{group.name}</span>
            <strong>{formatMinutes(group.total)}</strong>
          </button>
          <details open>
            <summary aria-label={group.name + '任务明细'} />
            <ul>
              {group.items.map((item) => {
                const task = tasks.find((task) => task.id === item.id);
                const label =
                  item.minutes === undefined
                    ? view.metric === 'actual'
                      ? '未记录'
                      : '未估时'
                    : formatMinutes(item.minutes);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="stage-time-task"
                      aria-pressed={view.selected === item.id}
                      onClick={() => view.select(item.id)}
                      onFocus={() => view.hover(item.id)}
                      onBlur={() => view.hover(undefined)}
                      onMouseEnter={() => view.hover(item.id)}
                      onMouseLeave={() => view.hover(undefined)}
                    >
                      <i aria-hidden="true" style={{ background: item.color }} />
                      <span>{item.title}</span>
                    </button>
                    {task &&
                    !task.deletedAt &&
                    task.status !== 'trashed' &&
                    task.status !== 'abandoned' ? (
                      <TaskEstimateEditor
                        key={view.metric === 'actual' ? 'actual' : 'planned'}
                        task={task}
                        today={today}
                        metric={view.metric === 'actual' ? 'actual' : 'planned'}
                        displayLabel={label}
                        disabled={view.saving}
                        onSave={
                          view.metric === 'actual' ? view.saveActual : view.saveEstimate
                        }
                      />
                    ) : (
                      <span className="stage-time-actual-value">{label}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      ))}
    </div>
  );
}
