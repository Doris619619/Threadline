/** @fileoverview 当天详情：周条切日、任务分组与真实预计；月份导航由上级页面管理。 */
import type { ReactNode } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addLocalDateDays, getLocalDateKey, parseLocalDateKey } from '@/lib/local-date';
import { getWeekRange, iterateLocalDateRange } from '@/lib/date-range';
import { planningDay } from './planning-rules';
import type { Task } from '@/types/domain';

/** 只渲染浏览日期对应的任务，保存与流转动作由页面等待服务器确认。 */
export function PlanningDay({
  date,
  days,
  busy,
  row,
  onDate,
  onCreate,
  onWaiting,
}: {
  date: string;
  days: Map<string, Task[]>;
  busy: boolean;
  row: (task: Task) => ReactNode;
  onDate: (date: string) => void;
  onCreate: () => void;
  onWaiting: () => void;
}) {
  const today = getLocalDateKey();
  const day = planningDay(days.get(date) ?? []);
  const week = getWeekRange(date);
  return (
    <section className="planning-agenda" aria-label="当天任务">
      <nav className="planning-week-nav" aria-label="规划日期导航">
        <button aria-label="上一周" onClick={() => onDate(addLocalDateDays(date, -7))}>
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
      <header className="planning-day-heading">
        <h3>
          {new Intl.DateTimeFormat('zh-CN', {
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          }).format(parseLocalDateKey(date))}
        </h3>
        <p>
          {day.pending.length} 项待完成 ·{' '}
          {day.unestimated === day.pending.length && day.pending.length > 0
            ? '预计待补充'
            : `预计 ${day.estimated} 分钟`}
          {day.unestimated > 0 && ` · ${day.unestimated} 项未估时`}
        </p>
      </header>
      {(days.get(date)?.length ?? 0) === 0 && (
        <div className="planning-empty">
          <CalendarDays size={30} aria-hidden="true" />
          <h3>这一天还没有安排</h3>
          <p>
            {date < today
              ? '可以切换日期查看其他安排。'
              : '添加一件事，或把待安排任务放到这一天。'}
          </p>
          {date >= today && (
            <div>
              <button
                disabled={busy}
                onClick={(event) => {
                  // 与月历添加入口一致，关闭编辑器后将焦点交还给触发按钮。
                  event.currentTarget.focus();
                  onCreate();
                }}
              >
                添加任务
              </button>
              <button onClick={onWaiting}>从待安排中选择</button>
            </div>
          )}
        </div>
      )}
      {day.timed.length > 0 && (
        <section className="planning-group">
          <h4>有时间 · {day.timed.length}</h4>
          {day.timed.map(row)}
        </section>
      )}
      {day.untimed.length > 0 && (
        <section className="planning-group">
          <h4>未定时间 · {day.untimed.length}</h4>
          {day.untimed.map(row)}
        </section>
      )}
      {day.completed.length > 0 && (
        <details key={date} className="planning-completed">
          <summary>已完成 · {day.completed.length}</summary>
          {day.completed.map(row)}
        </details>
      )}
    </section>
  );
}
