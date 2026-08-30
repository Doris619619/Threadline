/** @fileoverview 节律页：同步私密日期标记，刻意不接入 analytics、报告或 Records。 */

'use client';

import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Surface } from '@/components/ui/surface';
import { useRhythmState } from '@/features/rhythm/rhythm-state';
import { getMonthGrid } from '@/lib/date-range';
import { addLocalDateDays } from '@/lib/local-date';

/** 渲染随账号同步的私密节律月历，并允许用户按日期切换标记。 */
export function RhythmPanel({ selectedDate }: { selectedDate: string }) {
  const [anchor, setAnchor] = useState(selectedDate.slice(0, 7));
  const { marks, toggleMark } = useRhythmState();
  const monthAnchor = `${anchor}-01`;
  const grid = getMonthGrid(monthAnchor);
  return (
    <div className="rhythm-panel" data-testid="rhythm-panel">
      <Surface className="rhythm-intro">
        <ShieldCheck aria-hidden="true" size={22} />
        <div>
          <h2>节律</h2>
          <p>日期标记随账号同步，但不会进入洞察、报告或记录搜索。</p>
        </div>
      </Surface>
      <Surface className="rhythm-calendar">
        <header>
          <button
            type="button"
            aria-label="上个月"
            onClick={() => setAnchor(addLocalDateDays(monthAnchor, -1).slice(0, 7))}
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <h2>{anchor}</h2>
          <button
            type="button"
            aria-label="下个月"
            onClick={() => setAnchor(addLocalDateDays(monthAnchor, 32).slice(0, 7))}
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="rhythm-grid">
          {grid.map((date) => (
            <button
              type="button"
              key={date}
              className={`${date.startsWith(anchor) ? '' : 'is-outside'}${marks[date] ? 'is-marked' : ''}`.trim()}
              aria-pressed={Boolean(marks[date])}
              onClick={() => toggleMark(date)}
            >
              {date.slice(-2)}
            </button>
          ))}
        </div>
      </Surface>
    </div>
  );
}
