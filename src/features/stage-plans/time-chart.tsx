/** @fileoverview 阶段时间双层圆环与可键盘访问的项目/任务明细，预计与实际分别展示。 */
'use client';
import { useId, useState } from 'react';
import type { Task, Project } from '@/types/domain';
import { formatMinutes } from '@/features/tasks/task-time';
import {
  ringSector,
  stageTimeBreakdown,
  stageTimeSectors,
  type StageTimeMetric,
} from './time-breakdown';

/** 内圈项目、外圈任务共用分母；点击/聚焦明细与扇区对应，零值保持真实空态。 */
export function StageTimeChart({
  tasks,
  projects,
  stageId,
}: {
  tasks: Task[];
  projects: Project[];
  stageId: string;
}) {
  const [metric, setMetric] = useState<StageTimeMetric>('planned');
  const [selected, setSelected] = useState<string>();
  const [hovered, setHovered] = useState<string>();
  const titleId = useId();
  const { groups, total, missing } = stageTimeBreakdown(
    tasks,
    projects,
    stageId,
    metric,
  );
  const active = hovered ?? selected;
  const group = groups.find((item) => item.id === active);
  const item = groups
    .flatMap((group) => group.items)
    .find((item) => item.id === active);
  const value = group?.total ?? item?.minutes;
  const sectors = stageTimeSectors(groups, total);
  return (
    <section className="stage-time-panel" aria-labelledby={titleId}>
      <header>
        <div>
          <h2 id={titleId}>时间分布</h2>
          <span>内圈项目 · 外圈任务</span>
        </div>
        <div className="stage-time-switch" role="group" aria-label="时间统计口径">
          {(['planned', 'actual'] as const).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
            >
              {key === 'planned' ? '预计' : '实际'}
            </button>
          ))}
        </div>
      </header>
      <div className="stage-time-body">
        <div className="stage-time-visual" onMouseLeave={() => setHovered(undefined)}>
          <svg viewBox="0 0 320 320" aria-hidden="true">
            {total === 0 && (
              <circle
                cx="160"
                cy="160"
                r="112"
                fill="none"
                stroke="var(--border-subtle)"
                strokeWidth="48"
              />
            )}
            {sectors.map((group) => (
              <g key={group.id}>
                {group.fraction > 0 && (
                  <path
                    d={ringSector(group.start, group.fraction, 78, 107)}
                    fill={group.color}
                    opacity={
                      active &&
                      active !== group.id &&
                      !group.items.some((item) => item.id === active)
                        ? 0.4
                        : 1
                    }
                    onMouseEnter={() => setHovered(group.id)}
                    onClick={() => setSelected(group.id)}
                  />
                )}
                {group.slices
                  .filter((item) => item.fraction > 0)
                  .map((item) => (
                    <path
                      key={item.id}
                      data-stage-slice={item.id}
                      d={ringSector(item.start, item.fraction, 112, 144)}
                      fill={item.color}
                      opacity={
                        active && active !== group.id && active !== item.id ? 0.4 : 1
                      }
                      onMouseEnter={() => setHovered(item.id)}
                      onClick={() => setSelected(item.id)}
                    />
                  ))}
              </g>
            ))}
          </svg>
          <div className="stage-time-center">
            <span>
              {item?.title ??
                group?.name ??
                (metric === 'planned' ? '预计总时间' : '实际总时间')}
            </span>
            <strong>
              {active && (item || group) ? formatMinutes(value) : formatMinutes(total)}
            </strong>
            {total === 0 && (
              <small>{metric === 'planned' ? '暂无预计时间' : '暂无实际记录'}</small>
            )}
          </div>
        </div>
        <div className="stage-time-legend" aria-label="项目时间明细">
          {!groups.length && (
            <p className="stage-time-empty">添加任务后，在这里查看时间分布。</p>
          )}
          {groups.map((group) => (
            <details key={group.id} open>
              <summary>
                <i style={{ background: group.color }} />
                <span>{group.name}</span>
                <strong>{formatMinutes(group.total)}</strong>
              </summary>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={selected === item.id}
                      onClick={() =>
                        setSelected(selected === item.id ? undefined : item.id)
                      }
                      onFocus={() => setHovered(item.id)}
                      onBlur={() => setHovered(undefined)}
                      onMouseEnter={() => setHovered(item.id)}
                      onMouseLeave={() => setHovered(undefined)}
                    >
                      <i style={{ background: item.color }} />
                      <span>{item.title}</span>
                      <span>
                        {item.minutes === undefined
                          ? metric === 'planned'
                            ? '未估时'
                            : '未记录'
                          : formatMinutes(item.minutes)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
      {missing > 0 && (
        <p className="stage-time-missing">
          {missing} 项{metric === 'planned' ? '未估时' : '未记录'}，未计入占比
        </p>
      )}
    </section>
  );
}
