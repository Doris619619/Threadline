/** @fileoverview 阶段总预计、剩余预计和实际投入共用单层任务圆环，并提供原地耗时编辑明细。 */
'use client';
import { useId, useState, type ReactNode } from 'react';
import type { Task, Project, StagePlan, TaskTimeEntry } from '@/types/domain';
import { formatMinutes } from '@/features/tasks/task-time';
import {
  stageTimeBreakdown,
  stageTimeSectors,
  type StageTimeMetric,
} from './time-breakdown';
import { StageTimeRing } from './time-ring';
import { TaskEstimateEditor, type SaveStageEstimate } from './task-estimate-editor';
import type { StageTimeView } from './time-view';

const metricLabels = { planned: '总预计', remaining: '剩余预计', actual: '实际投入' };
/** 日期保持绝对月日，跨年补年份，不把过去日期误写成今天。 */
function dateLabel(date: string, today: string) {
  const [year, month, day] = date.split('-');
  return (
    (year === today.slice(0, 4) ? '' : year + '年') +
    Number(month) +
    '月' +
    Number(day) +
    '日'
  );
}

/** 阶段共用左右图表与操作清单，首页保留轻量明细；保存中锁定口径，剩余只排除完成项。 */
export function StageTimeChart({
  tasks,
  projects,
  plan,
  today,
  day,
  compactSummary = false,
  onSaveEstimate,
  onSaveActual,
  renderDetails,
}: {
  tasks: Task[];
  projects: Project[];
  plan?: StagePlan;
  today: string;
  day?: { date: string; entries?: TaskTimeEntry[] };
  compactSummary?: boolean;
  onSaveEstimate: SaveStageEstimate;
  onSaveActual: SaveStageEstimate;
  renderDetails?: (view: StageTimeView) => ReactNode;
}) {
  const [metric, setMetric] = useState<StageTimeMetric>('planned');
  const [selected, setSelected] = useState<string>();
  const [hovered, setHovered] = useState<string>();
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const summaries = (['planned', 'remaining', 'actual'] as const).map((key) => ({
    key,
    ...stageTimeBreakdown(tasks, projects, plan?.id, key, day),
  }));
  const { groups, total } = summaries.find((summary) => summary.key === metric)!;
  const active = hovered ?? selected;
  const item = groups
    .flatMap((group) => group.items)
    .find((item) => item.id === selected);
  const sectors = stageTimeSectors(groups, total);
  /** 等待确认时锁定口径切换，避免写入过程中卸载草稿；失败留在同一编辑器。 */
  const saveEstimate: SaveStageEstimate = async (original, minutes) => {
    setSaving(true);
    try {
      await onSaveEstimate(original, minutes);
    } finally {
      setSaving(false);
    }
  };
  /** 实际编辑保持输入基准并显式携带归属日期，确认期间禁止卸载编辑器。 */
  const saveActual: SaveStageEstimate = async (original, minutes, date) => {
    setSaving(true);
    try {
      await onSaveActual(original, minutes, date);
    } finally {
      setSaving(false);
    }
  };
  /** 鼠标或键盘选择同一任务时切换高亮，完整任务名称在独立说明中展示。 */
  const select = (id: string) =>
    setSelected((current) => (current === id ? undefined : id));
  const stageRange = plan
    ? dateLabel(plan.startDate, today) + '—' + dateLabel(plan.endDate, today)
    : dateLabel(day!.date, today);
  const remainingRange = plan
    ? today > plan.endDate
      ? '已结束'
      : dateLabel(today < plan.startDate ? plan.startDate : today, today) +
        '—' +
        dateLabel(plan.endDate, today)
    : stageRange;
  return (
    <section className="stage-time-panel" aria-labelledby={titleId}>
      <header>
        <div>
          <h2 id={titleId}>{plan ? '时间分布' : '日程时间分布'}</h2>
        </div>
      </header>
      <div
        className={
          compactSummary
            ? 'stage-time-switcher'
            : 'stage-time-metrics' + (plan ? ' is-stage' : '')
        }
        role="group"
        aria-label={compactSummary ? '时间分布口径' : '阶段时间统计'}
      >
        {summaries.map((summary) => (
          <button
            type="button"
            key={summary.key}
            aria-label={metricLabels[summary.key]}
            aria-pressed={metric === summary.key}
            title={
              summary.key === 'actual'
                ? undefined
                : summary.key === 'planned'
                  ? stageRange
                  : remainingRange
            }
            disabled={saving}
            onClick={() => {
              setMetric(summary.key);
              setSelected(undefined);
              setHovered(undefined);
            }}
          >
            {compactSummary ? (
              metricLabels[summary.key]
            ) : (
              <>
                <span>
                  {summary.key === 'planned'
                    ? plan
                      ? '整个阶段预计'
                      : '当日预计'
                    : metricLabels[summary.key]}
                </span>
                <strong>{formatMinutes(summary.total)}</strong>
                {!plan && summary.key !== 'actual' && (
                  <small>
                    {summary.key === 'planned' ? stageRange : remainingRange}
                  </small>
                )}
              </>
            )}
          </button>
        ))}
      </div>
      <div className={'stage-time-body' + (renderDetails ? ' is-unified' : '')}>
        <div className="stage-time-plot">
          <StageTimeRing
            sectors={sectors}
            total={total}
            active={active}
            centerTitle={metricLabels[metric]}
            emptyLabel={
              metric === 'actual'
                ? '暂无实际记录'
                : metric === 'remaining'
                  ? '暂无剩余预计'
                  : '暂无预计时间'
            }
            onSelect={select}
            onHover={setHovered}
          />
          {item && (
            <p className="stage-time-selection" aria-live="polite">
              {item.title} ·{' '}
              {item.minutes === undefined
                ? metric === 'actual'
                  ? '未记录'
                  : '未估时'
                : formatMinutes(item.minutes)}
            </p>
          )}
        </div>
        {renderDetails ? (
          renderDetails({
            metric,
            selected,
            active,
            saving,
            select,
            hover: setHovered,
            saveEstimate,
            saveActual,
          })
        ) : (
          <div className="stage-time-legend" aria-label="项目时间明细" key={metric}>
            {!groups.length && (
              <p className="stage-time-empty">
                {metric === 'remaining'
                  ? '所有任务均已完成，或尚未添加任务。'
                  : '添加任务后，在这里查看时间分布。'}
              </p>
            )}
            {groups.map((group) => (
              <details key={group.id} open>
                <summary
                  onMouseEnter={() => setHovered(group.id)}
                  onMouseLeave={() => setHovered(undefined)}
                >
                  <i aria-hidden="true" style={{ background: group.color }} />
                  <span>{group.name}</span>
                  <strong>{formatMinutes(group.total)}</strong>
                  <small>
                    {total ? Math.round((group.total / total) * 100) + '%' : '—'}
                  </small>
                </summary>
                <ul>
                  {group.items.map((item) => {
                    const task = tasks.find((task) => task.id === item.id);
                    const label =
                      item.minutes === undefined
                        ? metric === 'actual'
                          ? '未记录'
                          : '未估时'
                        : formatMinutes(item.minutes);
                    return (
                      <li key={item.id} data-stage-time-task={item.id}>
                        <button
                          type="button"
                          className="stage-time-task"
                          aria-label={item.title + ' ' + label}
                          aria-pressed={selected === item.id}
                          onClick={() => select(item.id)}
                          onFocus={() => setHovered(item.id)}
                          onBlur={() => setHovered(undefined)}
                          onMouseEnter={() => setHovered(item.id)}
                          onMouseLeave={() => setHovered(undefined)}
                        >
                          <i aria-hidden="true" style={{ background: item.color }} />
                          <span>{item.title}</span>
                        </button>
                        {task &&
                        task.status !== 'trashed' &&
                        task.status !== 'abandoned' &&
                        !task.deletedAt ? (
                          <TaskEstimateEditor
                            task={task}
                            metric={metric === 'actual' ? 'actual' : 'planned'}
                            today={today}
                            entryDate={day?.date}
                            displayLabel={label}
                            onSave={metric === 'actual' ? saveActual : saveEstimate}
                            disabled={saving}
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
        )}
      </div>
    </section>
  );
}
