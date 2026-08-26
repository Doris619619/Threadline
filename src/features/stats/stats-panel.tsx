/**
 * @fileoverview 统计页面，按所选日期汇总任务和 Daily 的完成率、实际投入及项目分布。
 */

'use client';

import { Surface } from '@/components/ui/surface';
import type { Daily, DailyHistoryEntry } from '@/features/daily/daily-panel';
import type { Project, Task } from '@/types/domain';

/** 将分钟数显示为适合统计阅读的小时分钟文本。 */
function formatMinutes(value: number): string {
  return value < 60 ? `${value} 分钟` : `${Math.floor(value / 60)} 小时${value % 60 ? ` ${value % 60} 分钟` : ''}`;
}

/** 渲染真实任务数据驱动的统计页面，而非与复盘共用的占位页面。 */
export function StatsPanel({
  tasks,
  projects,
  daily,
  dailyHistory,
  selectedDate,
}: {
  tasks: Task[];
  projects: Project[];
  daily: Daily[];
  dailyHistory: DailyHistoryEntry[];
  selectedDate: string;
}) {
  const current = tasks.filter((task) => task.status === 'active' && task.date === selectedDate);
  const completed = current.filter((task) => task.completed).length;
  const taskActual = current.reduce((total, task) => total + (task.actualDurationMinutes ?? 0), 0);
  const dailyActual = daily.reduce((total, item) => total + item.actual, 0);
  const recordedDays = new Set(dailyHistory.map((entry) => entry.date)).size;
  const totalActual = taskActual + dailyActual;
  const projectRows = projects
    .filter((project) => project.status === 'active')
    .map((project) => ({
      project,
      minutes: current
        .filter((task) => task.projectId === project.id)
        .reduce((total, task) => total + (task.actualDurationMinutes ?? 0), 0),
    }))
    .sort((left, right) => right.minutes - left.minutes);

  return (
    <div className="stats-panel" data-testid="stats-panel">
      <section className="stats-summary" aria-label="今日统计摘要">
        <Surface className="stats-summary-item">
          <span>普通任务完成</span>
          <strong>{current.length ? `${Math.round((completed / current.length) * 100)}%` : '0%'}</strong>
          <small>{completed} / {current.length} 项</small>
        </Surface>
        <Surface className="stats-summary-item">
          <span>今日实际投入</span>
          <strong>{formatMinutes(totalActual)}</strong>
          <small>任务 {formatMinutes(taskActual)} · Daily {formatMinutes(dailyActual)}</small>
        </Surface>
        <Surface className="stats-summary-item">
          <span>Daily 记录</span>
          <strong>{daily.filter((item) => item.completed || item.children.some((child) => child.completed)).length}/{daily.length}</strong>
          <small>已积累 {recordedDays} 天历史</small>
        </Surface>
      </section>
      <Surface className="stats-project-breakdown">
        <header>
          <div>
            <h2>今日项目投入</h2>
            <p>根据已填写的实际耗时统计。</p>
          </div>
          <span>{formatMinutes(totalActual)}</span>
        </header>
        {projectRows.every((row) => row.minutes === 0) ? (
          <p className="empty-copy">填写任务的“实际耗时”后，这里会显示项目分布。</p>
        ) : (
          <div className="stats-bars">
            {projectRows.map(({ project, minutes }) => (
              <div className="stats-bar-row" key={project.id}>
                <span>{project.name}</span>
                <i><b style={{ width: `${totalActual ? (minutes / totalActual) * 100 : 0}%`, background: project.color }} /></i>
                <small>{formatMinutes(minutes)}</small>
              </div>
            ))}
          </div>
        )}
      </Surface>
    </div>
  );
}
