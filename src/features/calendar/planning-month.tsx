/** @fileoverview 规划月份选择器：周一开头，区分今天、所选日期与普通任务密度。 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { getMonthGrid } from '@/lib/date-range';
import { getLocalDateKey, parseLocalDateKey } from '@/lib/local-date';
import { planningHeat } from './planning-rules';
import type { Task } from '@/types/domain';

/** 月份导航只改变可见月份；点击日期才提交选择，跨月格仍计算真实数量。 */
export function PlanningMonth({
  date,
  days,
  onSelect,
}: {
  date: string;
  days: Map<string, Task[]>;
  onSelect: (date: string) => void;
}) {
  const [month, setMonth] = useState(date.slice(0, 7));
  const today = getLocalDateKey();
  /** 使用自然月加减，避免大小月和跨年边界跳月。 */
  const shift = (amount: number) => {
    const next = parseLocalDateKey(`${month}-01`);
    next.setMonth(next.getMonth() + amount);
    setMonth(getLocalDateKey(next).slice(0, 7));
  };
  return (
    <section className="planning-month" aria-label="月份选日">
      <header>
        <button aria-label="上个月" onClick={() => shift(-1)}>
          <ChevronLeft size={18} />
        </button>
        <h3>
          {new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(
            parseLocalDateKey(`${month}-01`),
          )}
        </h3>
        <button aria-label="下个月" onClick={() => shift(1)}>
          <ChevronRight size={18} />
        </button>
      </header>
      <div className="planning-month-grid" aria-hidden="true">
        {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
          <small key={day}>{day}</small>
        ))}
      </div>
      <div className="planning-month-grid" role="group" aria-label={`${month}任务分布`}>
        {getMonthGrid(`${month}-01`).map((day) => {
          const count = days.get(day)?.length ?? 0;
          return (
            <button
              key={day}
              className="planning-date"
              data-outside={!day.startsWith(month)}
              data-heat={planningHeat(count)}
              aria-pressed={date === day}
              aria-current={day === today ? 'date' : undefined}
              aria-label={`${day}，${count} 项任务${day === today ? '，今天' : ''}`}
              onClick={() => onSelect(day)}
            >
              <span>{Number(day.slice(-2))}</span>
              <small>{count || '—'}</small>
            </button>
          );
        })}
      </div>
      <p className="planning-legend">
        {['0 项', '1–2 项', '3–4 项', '5+ 项'].map((label, i) => (
          <span key={label}>
            <i data-heat={i} />
            {label}
          </span>
        ))}
      </p>
    </section>
  );
}
