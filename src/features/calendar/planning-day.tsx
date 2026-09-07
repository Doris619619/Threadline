/** @fileoverview 当天规划：紧凑周条、未定时间区与单日时间轴；月份导航和写入由上级管理。 */
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { addLocalDateDays, getLocalDateKey } from '@/lib/local-date';
import { getWeekRange, iterateLocalDateRange } from '@/lib/date-range';
import { planningDay } from './planning-rules';
import { PlanningTimeline } from './planning-timeline';
import { PlanningUntimed } from './planning-untimed';
import type { Project, Task } from '@/types/domain';

/** 只渲染浏览日期对应的任务，保存与流转动作由页面等待服务器确认。 */
export function PlanningDay({
  date,
  days,
  busy,
  projects,
  onSelect,
  row,
  onDate,
  onSetTime,
  onBack,
  onAdd,
}: {
  date: string;
  days: Map<string, Task[]>;
  busy: boolean;
  projects: Project[];
  onSelect: (tasks: Task[]) => void;
  row: (task: Task) => ReactNode;
  onDate: (date: string) => void;
  onSetTime: (task: Task) => void;
  onBack: () => void;
  onAdd: () => void;
}) {
  const today = getLocalDateKey();
  const day = planningDay(days.get(date) ?? []);
  const week = getWeekRange(date);
  return (
    <section className="planning-agenda" aria-label="当天任务">
      <div className="planning-day-navigation">
        <nav className="planning-week-nav" aria-label="规划日期导航">
          <button aria-label="返回月历" onClick={onBack}>
            <ChevronLeft size={22} />
          </button>
          <h1
            tabIndex={-1}
            aria-label={`${date.slice(0, 4)}年${Number(date.slice(5, 7))}月日程`}
          >
            {Number(date.slice(5, 7))}月
          </h1>
          <button
            aria-label="上一周"
            onClick={() => onDate(addLocalDateDays(date, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <button aria-label="下一周" onClick={() => onDate(addLocalDateDays(date, 7))}>
            <ChevronRight size={18} />
          </button>
          <button onClick={() => onDate(getLocalDateKey())}>今天</button>
          <button
            aria-label="添加任务"
            disabled={busy || date < today}
            onClick={(event) => {
              event.currentTarget.focus();
              onAdd();
            }}
          >
            <Plus size={22} />
          </button>
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
      <PlanningUntimed
        key={date}
        tasks={day.untimed}
        busy={busy}
        onSelect={onSelect}
        onSetTime={onSetTime}
      />
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
