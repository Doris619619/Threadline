/** @fileoverview 经典完整图表明细与新版合并视图共用统计和保存，独立保留各版输入草稿。 */
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
import { ClassicTimeRing } from './time-ring-classic';
import { softTimeColor } from './time-colors';
import { ClassicTimeLegend } from './time-legend-classic';
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

/** 经典保留双环和简明图例，下方另放状态清单；新版合并右侧操作，保存中锁定切换。 */
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
  renderClassicTasks,
  layout = 'new',
  onLayoutChange,
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
  renderClassicTasks?: (view: StageTimeView) => ReactNode;
  layout?: 'classic' | 'new';
  onLayoutChange?: (layout: 'classic' | 'new') => void;
}) {
  const [metric, setMetric] = useState<StageTimeMetric>('planned');
  const [selected, setSelected] = useState<string>();
  const [hovered, setHovered] = useState<string>();
  const [saving, setSaving] = useState(false);
  const classic = !!plan && layout === 'classic';
  const titleId = useId();
  const summaries = (['planned', 'remaining', 'actual'] as const).map((key) => ({
    key,
    ...stageTimeBreakdown(tasks, projects, plan?.id, key, day),
  }));
  const { groups, total, missing } = summaries.find(
    (summary) => summary.key === metric,
  )!;
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
  const timeSummary = (
    <div
      className={
        compactSummary
          ? 'stage-time-switcher'
          : plan
            ? 'stage-time-summary'
            : 'stage-time-metrics'
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
                    ? metricLabels.planned
                    : '当日预计'
                  : metricLabels[summary.key]}
              </span>
              <strong>{formatMinutes(summary.total)}</strong>
              {!plan && summary.key !== 'actual' && (
                <small>{summary.key === 'planned' ? stageRange : remainingRange}</small>
              )}
            </>
          )}
        </button>
      ))}
    </div>
  );
  const view: StageTimeView = {
    metric,
    selected,
    active,
    saving,
    select,
    hover: setHovered,
    saveEstimate,
    saveActual,
  };
  return (
    <>
      <section
        className={'stage-time-panel' + (classic ? ' is-classic-panel' : '')}
        aria-labelledby={titleId}
      >
        <header
          className={
            classic
              ? 'stage-time-classic-header'
              : plan
                ? 'stage-time-header'
                : undefined
          }
        >
          <div className="stage-time-heading">
            <h2 id={titleId}>{plan ? '时间分布' : '日程时间分布'}</h2>
            {classic && <span>内圈项目 · 外圈任务</span>}
          </div>
          {plan && !classic && timeSummary}
          {classic && (
            <div
              className="stage-time-classic-switch"
              role="group"
              aria-label="时间统计口径"
            >
              {(['planned', 'actual'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={metric === value}
                  disabled={saving}
                  onClick={() => {
                    setMetric(value);
                    setSelected(undefined);
                    setHovered(undefined);
                  }}
                >
                  {value === 'planned' ? '预计' : '实际'}
                </button>
              ))}
            </div>
          )}
          {plan && (
            <div
              className="stage-time-layout-switch"
              role="group"
              aria-label="计划时间分布样式"
            >
              {(['classic', 'new'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={layout === value}
                  disabled={saving}
                  onClick={() => {
                    if (value === 'classic' && metric === 'remaining')
                      setMetric('planned');
                    onLayoutChange?.(value);
                  }}
                >
                  {value === 'classic' ? '经典' : '新版'}
                </button>
              ))}
            </div>
          )}
        </header>
        {!plan && timeSummary}
        <div
          className={
            'stage-time-body' +
            (renderDetails ? ' is-unified' : '') +
            (classic ? ' is-classic' : '')
          }
        >
          <div className="stage-time-plot">
            {classic ? (
              <ClassicTimeRing
                groups={groups}
                sectors={sectors}
                total={total}
                active={active}
                centerTitle={metric === 'actual' ? '实际总时间' : '预计总时间'}
                onSelect={select}
                onHover={setHovered}
              />
            ) : (
              <StageTimeRing
                sectors={sectors}
                total={total}
                active={active}
                centerTitle={metricLabels[metric]}
                onSelect={select}
                onHover={setHovered}
              />
            )}
            {item && !classic && (
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
          {plan && (
            <ClassicTimeLegend
              groups={groups}
              tasks={tasks}
              today={today}
              view={view}
              hidden={!classic}
            />
          )}
          {renderDetails ? (
            <div className="stage-time-details-slot" hidden={classic}>
              {renderDetails(view)}
            </div>
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
                    <i
                      aria-hidden="true"
                      style={{ background: softTimeColor(group.color) }}
                    />
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
                            <i
                              aria-hidden="true"
                              style={{ background: softTimeColor(item.color) }}
                            />
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
        {classic && missing > 0 && (
          <p className="stage-time-missing">
            {missing} 项{metric === 'actual' ? '未记录' : '未估时'}，未计入占比
          </p>
        )}
      </section>
      {renderClassicTasks && (
        <div className="stage-classic-tasks-slot" hidden={!classic}>
          {renderClassicTasks(view)}
        </div>
      )}
    </>
  );
}
