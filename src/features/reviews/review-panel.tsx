/**
 * @fileoverview 复盘页面，按今日或本周汇总完成、投入与任务流转。
 */

'use client';
import { useState } from 'react';
import { isSameDay, isSameWeek, parseISO } from 'date-fns';
import { Surface } from '@/components/ui/surface';
import type { Daily, DailyHistoryEntry } from '@/features/daily/daily-panel';
import type { CloseRecord, HistoryEvent, Project, Task } from '@/types/domain';

/** 将分钟数格式化为复盘指标中的小时分钟文案。 */
const minutes = (value: number) =>
  value < 60
    ? `${value}min`
    : `${Math.floor(value / 60)}h${value % 60 ? `${value % 60}min` : ''}`;

/** 渲染按今日或本周切换的复盘页面，聚合任务、Daily 与流转历史。 */
export function ReviewPanel({
  tasks,
  projects,
  daily,
  dailyHistory,
  history,
  closeRecords,
  selectedDate,
}: {
  tasks: Task[];
  projects: Project[];
  daily: Daily[];
  dailyHistory: DailyHistoryEntry[];
  history: HistoryEvent[];
  closeRecords: CloseRecord[];
  selectedDate: string;
}) {
  const [period, setPeriod] = useState<'day' | 'week'>('day');
  const reference = parseISO(selectedDate);
  const inPeriod = (date: string) =>
    period === 'day'
      ? isSameDay(parseISO(date), reference)
      : isSameWeek(parseISO(date), reference, { weekStartsOn: 1 });
  const relevant = tasks.filter(
    (task) =>
      task.status !== 'trashed' &&
      inPeriod(task.date ?? task.postponedFrom ?? task.createdAt.slice(0, 10)),
  );
  const completed = relevant.filter((task) => task.completed).length;
  const taskActual = relevant.reduce(
    (total, task) => total + (task.actualDurationMinutes ?? 0),
    0,
  );
  const dailyActual =
    dailyHistory
      .filter((entry) => inPeriod(entry.date))
      .reduce((total, entry) => total + entry.actual, 0) +
    (dailyHistory.some((entry) => entry.date === selectedDate)
      ? 0
      : daily.reduce((total, item) => total + item.actual, 0));
  const planned = relevant.reduce(
    (total, task) => total + (task.plannedDurationMinutes ?? 0),
    0,
  );
  const totalActual = taskActual + dailyActual;
  const periodDailyHistory = dailyHistory.filter((entry) => inPeriod(entry.date));
  const dailyDone = periodDailyHistory.length
    ? periodDailyHistory.filter((entry) => entry.completed).length
    : daily.filter(
        (item) => item.completed || item.children.some((child) => child.completed),
      ).length;
  const dailyTotal = periodDailyHistory.length
    ? periodDailyHistory.length
    : daily.length;
  const flow = [
    [
      '移期',
      history.filter(
        (event) =>
          event.type === 'rescheduled' && inPeriod(event.occurredAt.slice(0, 10)),
      ).length,
    ],
    [
      '放弃',
      history.filter(
        (event) =>
          event.type === 'abandoned' && inPeriod(event.occurredAt.slice(0, 10)),
      ).length,
    ],
    [
      '进入待安排',
      history.filter(
        (event) => (event.type === 'waiting' || event.type === 'backlog') && inPeriod(event.occurredAt.slice(0, 10)),
      ).length,
    ],
  ] as const;
  return (
    <div className="review-panel">
      <header>
        <div>
          <h2>{period === 'day' ? '今日复盘' : '本周复盘'}</h2>
          <p>回顾完成、遗留与任务流转，再决定下一步安排。</p>
        </div>
        <div className="period-toggle">
          <button
            className={period === 'day' ? 'active' : ''}
            onClick={() => setPeriod('day')}
          >
            今日
          </button>
          <button
            className={period === 'week' ? 'active' : ''}
            onClick={() => setPeriod('week')}
          >
            本周
          </button>
        </div>
      </header>
      <div className="review-grid">
        <Metric
          title="投入时间"
          value={minutes(totalActual)}
          detail="普通与 Daily 实际耗时"
        />
        <Metric
          title="完成情况"
          value={
            relevant.length
              ? `${Math.round((completed / relevant.length) * 100)}%`
              : '0%'
          }
          detail={`${completed} / ${relevant.length}`}
        />
        <Metric
          title="下一步线索"
          value={`${flow.reduce((total, [, count]) => total + count, 0)} 项`}
          detail={`预计 ${minutes(planned)} · 查看下方流转`}
        />
      </div>
      <Surface className="review-details">
        <section>
          <h3>投入分布</h3>
          <div className="project-bars">
            {projects.map((project) => {
              const value =
                closeRecords
                  .filter((record) => inPeriod(record.date))
                  .reduce(
                    (total, record) => total + (record.projectMinutes[project.id] ?? 0),
                    0,
                  ) ||
                relevant
                  .filter((task) => task.projectId === project.id)
                  .reduce(
                    (total, task) => total + (task.actualDurationMinutes ?? 0),
                    0,
                  );
              return (
                <Bar
                  key={project.id}
                  label={project.name}
                  value={minutes(value)}
                  percent={totalActual ? Math.round((value / totalActual) * 100) : 0}
                />
              );
            })}
          </div>
        </section>
        <section>
          <h3>Daily 回顾</h3>
          <p>
            {dailyDone}/{dailyTotal} 已完成 · {minutes(dailyActual)}
          </p>
          <p>已记录 {dailyHistory.length} 条 Daily 历史</p>
        </section>
        <section>
          <h3>遗留与流转</h3>
          {flow.map(([label, count]) => (
            <p key={label}>
              {label} {count}
            </p>
          ))}
        </section>
      </Surface>
    </div>
  );
}
/** 展示复盘中的单个汇总指标。 */
function Metric({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Surface className="review-metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </Surface>
  );
}
/** 展示项目投入占比的横向条目。 */
function Bar({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div className="bar-row">
      <span>{label}</span>
      <i>
        <b style={{ width: `${percent}%` }} />
      </i>
      <small>{value}</small>
    </div>
  );
}
