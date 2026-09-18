/** @fileoverview 习惯打卡区的独立日期导航；当前日跟随账号时区，历史日期只用于查看和补录。 */
'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { habitAddDays } from './habit-time';

/** 使用纯日期切换记录，禁止未来日期；保存中的日期被冻结，统计范围不随此导航变化。 */
export function HabitDayNavigation({
  date,
  today,
  disabled,
  onChange,
}: {
  date: string;
  today: string;
  disabled: boolean;
  onChange: (date: string | null) => void;
}) {
  /** 日期输入清空或指向未来时保留原选择；返回今天恢复自动跟随。 */
  const select = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return;
    onChange(value === today ? null : value);
  };
  const label =
    date === today ? '今天' : date === habitAddDays(today, -1) ? '昨天' : '记录';
  return (
    <nav className="habit-day-navigation" aria-label="打卡日期">
      <button
        type="button"
        aria-label="前一天记录"
        disabled={disabled}
        onClick={() => select(habitAddDays(date, -1))}
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <label className="habit-day-picker">
        <span>{label}</span>
        <input
          type="date"
          aria-label="记录日期"
          value={date}
          max={today}
          disabled={disabled}
          onChange={(event) => select(event.target.value)}
        />
      </label>
      <button
        type="button"
        aria-label="后一天记录"
        disabled={disabled || date >= today}
        onClick={() => select(habitAddDays(date, 1))}
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      {date !== today && (
        <button
          type="button"
          className="habit-return-today"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          今天
        </button>
      )}
    </nav>
  );
}
