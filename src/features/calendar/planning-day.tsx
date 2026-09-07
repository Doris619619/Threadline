/** @fileoverview 当天规划：紧凑周条、未定时间区与单日时间轴；月份导航和写入由上级管理。 */
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addLocalDateDays, getLocalDateKey, parseLocalDateKey } from '@/lib/local-date';
import { getWeekRange, iterateLocalDateRange } from '@/lib/date-range';
import { planningDay } from './planning-rules';
import { PlanningTimeline } from './planning-timeline';
import type { Project, Task } from '@/types/domain';

/** 只渲染浏览日期对应的任务，保存与流转动作由页面等待服务器确认。 */
export function PlanningDay({
  date,
  days,
  busy,
  projects,
  onSelect,
  waiting,
  row,
  onDate,
  onWaiting,
}: {
  date: string;
  days: Map<string, Task[]>;
  busy: boolean;
  projects: Project[];
  onSelect: (tasks: Task[]) => void;
  waiting: ReactNode;
  row: (task: Task) => ReactNode;
  onDate: (date: string) => void;
  onWaiting: () => void;
}) {
  const today = getLocalDateKey();
  const day = planningDay(days.get(date) ?? []);
  const week = getWeekRange(date);
  return (
    <section className="planning-agenda" aria-label="当天任务">
      <div className="planning-day-navigation">
        <nav className="planning-week-nav" aria-label="规划日期导航">
          <button
            aria-label="上一周"
            onClick={() => onDate(addLocalDateDays(date, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="planning-week-label">
            {date.slice(0, 4)} 年 {Number(date.slice(5, 7))} 月
          </span>
          <button aria-label="下一周" onClick={() => onDate(addLocalDateDays(date, 7))}>
            <ChevronRight size={18} />
          </button>
          <button onClick={() => onDate(getLocalDateKey())}>今天</button>
        </nav>
        <div
          className="planning-week"
          role="group"
          aria-label={`${week.start} 至 ${week.end}`}
        >
          {iterateLocalDateRange(week).map((item, index) => (
            <button
              key={item}
              aria-pressed={item === date}
              aria-current={item === today ? 'date' : undefined}
              aria-label={`${item}，${days.get(item)?.length ?? 0} 项任务`}
              onClick={() => onDate(item)}
            >
              <small>{['一', '二', '三', '四', '五', '六', '日'][index]}</small>
              <strong>{Number(item.slice(-2))}</strong>
              <i
                className="planning-week-mark"
                data-active={(days.get(item)?.length ?? 0) > 0}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      </div>
      <header className="planning-day-heading">
        <h2>
          {new Intl.DateTimeFormat('zh-CN', {
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          }).format(parseLocalDateKey(date))}
        </h2>
        <p>
          {day.pending.length} 项待完成 ·{' '}
          {day.unestimated === day.pending.length && day.pending.length > 0
            ? '预计待补充'
            : `预计 ${day.estimated} 分钟`}
          {day.unestimated > 0 && ` · ${day.unestimated} 项未估时`}
        </p>
      </header>
      <div className="planning-pools">
        <details className="planning-untimed" key={`untimed-${date}`}>
          <summary>
            未定时间 <span>{day.untimed.length}</span>
          </summary>
          {day.untimed.length > 0 ? (
            day.untimed.map(row)
          ) : (
            <p>当天任务都已定时，或尚未添加。</p>
          )}
          {date >= today && (
            <button className="planning-pick-waiting" onClick={onWaiting}>
              从待安排中选择
            </button>
          )}
        </details>
        {waiting}
      </div>
      <PlanningTimeline
        date={date}
        tasks={day.timed}
        projects={projects}
        busy={busy}
        onSelect={onSelect}
      />
      {day.completed.length > 0 && (
        <details key={date} className="planning-completed">
          <summary>已完成 · {day.completed.length}</summary>
          {day.completed.map(row)}
        </details>
      )}
    </section>
  );
}
