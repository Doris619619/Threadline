'use client';
import { useState } from 'react';
import { Surface } from '@/components/ui/surface';
import type { Daily, DailyHistoryEntry } from '@/features/daily/daily-panel';
import type { Project, Task } from '@/types/domain';

const minutes = (value: number) =>
  value < 60
    ? `${value}min`
    : `${Math.floor(value / 60)}h${value % 60 ? `${value % 60}min` : ''}`;

export function ReviewPanel({
  tasks,
  projects,
  daily,
  dailyHistory,
}: {
  tasks: Task[];
  projects: Project[];
  daily: Daily[];
  dailyHistory: DailyHistoryEntry[];
}) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const relevant = tasks.filter((task) => task.status !== 'trashed');
  const completed = relevant.filter((task) => task.completed).length;
  const taskActual = relevant.reduce(
    (total, task) => total + (task.actualDurationMinutes ?? 0),
    0,
  );
  const dailyActual = daily.reduce((total, item) => total + item.actual, 0);
  const planned = relevant.reduce(
    (total, task) => total + (task.plannedDurationMinutes ?? 0),
    0,
  );
  const totalActual = taskActual + dailyActual;
  const dailyDone = daily.filter(
    (item) => item.completed || item.children.some((child) => child.completed),
  ).length;
  const flow = [
    ['移期', relevant.filter((task) => task.status === 'rescheduled').length],
    ['放弃', relevant.filter((task) => task.status === 'abandoned').length],
    ['进入待安排', relevant.filter((task) => task.status === 'backlog').length],
  ] as const;
  return (
    <div className="review-panel">
      <header>
        <div>
          <h2>{period === 'week' ? '周复盘' : '月复盘'}</h2>
          <p>所有统计都由任务、Daily 与历史流转记录聚合。</p>
        </div>
        <div className="period-toggle">
          <button
            className={period === 'week' ? 'active' : ''}
            onClick={() => setPeriod('week')}
          >
            周
          </button>
          <button
            className={period === 'month' ? 'active' : ''}
            onClick={() => setPeriod('month')}
          >
            月
          </button>
        </div>
      </header>
      <div className="review-grid">
        <Metric
          title="总投入时间"
          value={minutes(totalActual)}
          detail="普通与 Daily 实际耗时"
        />
        <Metric
          title="普通任务完成率"
          value={
            relevant.length
              ? `${Math.round((completed / relevant.length) * 100)}%`
              : '0%'
          }
          detail={`${completed} / ${relevant.length}`}
        />
        <Metric
          title="计划 vs 实际"
          value={minutes(totalActual)}
          detail={`预计 ${minutes(planned)}`}
        />
      </div>
      <Surface className="review-details">
        <section>
          <h3>各项目投入</h3>
          <div className="project-bars">
            {projects
              .filter((project) => project.status === 'active')
              .map((project) => {
                const value = relevant
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
          <h3>Daily 完成情况</h3>
          <p>
            {dailyDone}/{daily.length} 已完成 · {minutes(dailyActual)}
          </p>
          <p>已记录 {dailyHistory.length} 条 Daily 历史</p>
        </section>
        <section>
          <h3>任务流转</h3>
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
