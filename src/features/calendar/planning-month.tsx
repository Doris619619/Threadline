/** @fileoverview 月历首页：主题热力与次要任务数量，月份浏览与当天详情分层。 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getMonthGrid } from '@/lib/date-range';
import {
  getLocalDateKey,
  formatCalendarDate,
  parseLocalDateKey,
} from '@/lib/local-date';
import { planningHeat } from './planning-rules';
import type { Task } from '@/types/domain';

/** 可见月份由页面保存；返回月历时保留原月份与日期焦点，空日期不添加占位标记。 */
export function PlanningMonth({
  date,
  month,
  days,
  onMonth,
  onSelect,
}: {
  date: string;
  month: string;
  days: Map<string, Task[]>;
  onMonth: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  const today = getLocalDateKey();
  /** 使用自然月加减，避免大小月和跨年边界跳月。 */
  const shift = (amount: number) => {
    const next = parseLocalDateKey(`${month}-01`);
    next.setMonth(next.getMonth() + amount);
    onMonth(formatCalendarDate(next).slice(0, 7));
  };
  return (
    <section className="planning-month" aria-label="月份选日">
      <header className="planning-month-heading">
        <h2 aria-label={`${month.slice(0, 4)}年${Number(month.slice(5))}月`}>
          <span>{month.slice(0, 4)}年</span>
          {Number(month.slice(5))}月
        </h2>
        <nav aria-label="月份导航">
          <button aria-label="上个月" onClick={() => shift(-1)}>
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => onMonth(today.slice(0, 7))}>今天</button>
          <button aria-label="下个月" onClick={() => shift(1)}>
            <ChevronRight size={20} />
          </button>
        </nav>
      </header>
      <div className="planning-month-grid planning-weekdays" aria-hidden="true">
        {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="planning-month-grid" role="group" aria-label={`${month}任务分布`}>
        {getMonthGrid(`${month}-01`).map((day) => {
          const tasks = days.get(day) ?? [];
          return (
            <button
              key={day}
              className="planning-date"
              data-date={day}
              data-heat={planningHeat(tasks.length)}
              data-outside={!day.startsWith(month)}
              aria-pressed={date === day}
              aria-current={day === today ? 'date' : undefined}
              aria-label={`${day}，${tasks.length} 项任务${day === today ? '，今天' : ''}`}
              onClick={() => onSelect(day)}
            >
              <span className="planning-date-number">{Number(day.slice(-2))}</span>
              {tasks.length > 0 && (
                <small className="planning-date-count" aria-hidden="true">
                  {tasks.length} 项
                </small>
              )}
            </button>
          );
        })}
      </div>
      <footer className="planning-month-footer">
        <div
          className="planning-legend"
          aria-label="任务密度：1至2项、3至4项、5至7项、8项及以上"
        >
          <span>少</span>
          {[1, 2, 3, 4].map((level) => (
            <i key={level} data-heat={level} aria-hidden="true" />
          ))}
          <span>多</span>
        </div>
      </footer>
    </section>
  );
}
