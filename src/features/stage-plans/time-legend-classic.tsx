/** @fileoverview 经典版右侧简明明细：项目总量、任务色点与时长，预计支持单框原地编辑。 */
'use client';
import type { Task } from '@/types/domain';
import { formatMinutes } from '@/features/tasks/task-time';
import type { StageTimeGroup } from './time-breakdown';
import type { StageTimeView } from './time-view';
import { TaskEstimateEditor } from './task-estimate-editor';

/** 保留旧版可滚动项目明细；选择联动双环，编辑继续使用同一 Task 的确认保存。 */
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
        <details key={group.id} open>
          <summary
            onMouseEnter={() => view.hover(group.id)}
            onMouseLeave={() => view.hover(undefined)}
          >
            <i aria-hidden="true" style={{ background: group.color }} />
            <span>{group.name}</span>
            <strong>{formatMinutes(group.total)}</strong>
          </summary>
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
      ))}
    </div>
  );
}
