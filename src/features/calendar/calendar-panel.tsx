/** @fileoverview 日历页：以共享 analytics 的实际投入记录显示周一开头的项目投入热力。 */

'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Surface } from '@/components/ui/surface';
import { getMonthGrid, getMonthRange } from '@/lib/date-range';
import { createAnalyticsResult, type AnalyticsInput } from '@/lib/analytics';
import { addLocalDateDays, getLocalDateKey, parseLocalDateKey } from '@/lib/local-date';

/** 将分钟显示为简短小时分钟，供日历 tooltip 和读屏文本共享。 */
function formatMinutes(minutes: number): string {
  return minutes < 60
    ? `${minutes}min`
    : `${Math.floor(minutes / 60)}h${minutes % 60 ? `${minutes % 60}min` : ''}`;
}

/** 将去重项目投入数映射为固定五档，不混入完成任务数量。 */
function getHeatLevel(projectCount: number): number {
  return Math.min(projectCount, 4);
}

/** 渲染可选择日期的项目投入热力月历。 */
export function CalendarPanel({
  analyticsInput,
  selectedDate,
  onSelectDate,
}: {
  analyticsInput: Omit<AnalyticsInput, 'range'>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const [anchor, setAnchor] = useState(selectedDate.slice(0, 7));
  const monthAnchor = `${anchor}-01`;
  const result = useMemo(
    () =>
      createAnalyticsResult({ ...analyticsInput, range: getMonthRange(monthAnchor) }),
    [analyticsInput, monthAnchor],
  );
  const dayMap = new Map(result.days.map((day) => [day.date, day]));
  const grid = getMonthGrid(monthAnchor);
  const monthLabel = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
  }).format(parseLocalDateKey(monthAnchor));
  /** 仅变更可见月份，不改写当前选中的业务日期。 */
  const shiftMonth = (days: number) =>
    setAnchor(addLocalDateDays(monthAnchor, days).slice(0, 7));
  /** 同时将工作区选择和可见月份恢复到用户本地的今天。 */
  const selectToday = () => {
    const today = getLocalDateKey();
    setAnchor(today.slice(0, 7));
    onSelectDate(today);
  };
  /** 选择日期并让跨月补齐格立即成为当前可见月份。 */
  const selectDate = (date: string) => {
    setAnchor(date.slice(0, 7));
    onSelectDate(date);
  };

  return (
    <div className="calendar-panel" data-testid="calendar-panel">
      <Surface className="calendar-intro" variant="flat">
        <div>
          <h2>项目投入热力</h2>
          <p>颜色表示当天实际有记录投入时间的去重项目数，不表示完成任务数。</p>
        </div>
        <span>0 / 1 / 2 / 3 / 4+ 项目</span>
      </Surface>
      <Surface className="calendar-surface">
        <header className="calendar-toolbar">
          <div className="calendar-toolbar-actions">
            <button type="button" aria-label="上个月" onClick={() => shiftMonth(-1)}>
              <ChevronLeft aria-hidden="true" size={18} />
            </button>
            <button
              type="button"
              className="calendar-today-button"
              onClick={selectToday}
            >
              今天
            </button>
          </div>
          <h2>{monthLabel}</h2>
          <button type="button" aria-label="下个月" onClick={() => shiftMonth(32)}>
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="calendar-weekdays" aria-hidden="true">
          {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div
          className="calendar-grid"
          role="grid"
          aria-label={`${monthLabel}项目投入热力`}
        >
          {grid.map((date) => {
            const day = dayMap.get(date);
            const inMonth = date.startsWith(anchor);
            const heatCount = day?.heatProjectCount ?? 0;
            const label = `${date}：${heatCount} 个项目 · ${formatMinutes(day?.actualMinutes ?? 0)}`;
            return (
              <button
                type="button"
                key={date}
                role="gridcell"
                aria-label={label}
                title={label}
                data-heat={getHeatLevel(heatCount)}
                className={`calendar-day${!inMonth ? 'is-outside' : ''}${date === selectedDate ? 'is-selected' : ''}`}
                onClick={() => selectDate(date)}
              >
                <span>{date.slice(-2)}</span>
                <small>
                  {day?.actualMinutes ? formatMinutes(day.actualMinutes) : ''}
                </small>
              </button>
            );
          })}
        </div>
      </Surface>
    </div>
  );
}
