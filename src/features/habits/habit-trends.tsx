/** @fileoverview 睡觉/起床的独立时间趋势、历史目标和可访问每日明细；缺失记录保持断线。 */
'use client';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { createLocalDateRange, iterateLocalDateRange } from '@/lib/date-range';
import type { HabitEntry, HabitRule } from './habit-types';
import { formatHabitMinutes, habitMinutes } from './habit-time';
import { habitGrade, habitRuleForDate } from './habit-statistics';

/** 单一时刻轴避免睡觉、起床混在双轴图；详情按钮同时支持触控与键盘。 */
export function HabitTimeTrend({
  kind,
  entries,
  rules,
  start,
  end,
  average,
  count,
  onSelect,
}: {
  kind: 'sleep' | 'wake';
  entries: HabitEntry[];
  rules: HabitRule[];
  start: string;
  end: string;
  average: number | null;
  count: number;
  onSelect: (date: string) => void;
}) {
  const dates = iterateLocalDateRange(createLocalDateRange(start, end));
  const points = dates.map((date) => {
    const entry = entries.find(
      (row) => !row.deleted_at && row.kind === kind && row.business_date === date,
    );
    const rule = entry
      ? (rules.find((row) => row.id === entry.rule_id) ?? habitRuleForDate(rules, date))
      : habitRuleForDate(rules, date);
    return {
      date,
      value: entry?.local_time ? habitMinutes(entry.local_time, date, kind) : null,
      target: kind === 'sleep' ? rule.sleep_target : rule.wake_target,
      entry,
    };
  });
  const label = kind === 'sleep' ? '睡觉时间' : '起床时间';
  return (
    <section className="habit-trend" aria-label={label}>
      <header>
        <h2>{label}</h2>
        <span className="habit-caption">{count} 次记录</span>
      </header>
      <p className="habit-average">
        {average === null ? (
          '暂无记录'
        ) : (
          <>
            <small>平均 </small>
            {formatHabitMinutes(average)}
          </>
        )}
      </p>
      {count ? (
        <>
          <div className="habit-chart" data-testid={`${kind}-trend`}>
            <ResponsiveContainer width="100%" height={210}>
              <LineChart
                data={points}
                margin={{ top: 12, right: 14, bottom: 0, left: 0 }}
                onClick={(state) => {
                  if (state.activeLabel) onSelect(String(state.activeLabel));
                }}
              >
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(date: string) => date.slice(5)}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={26}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  width={52}
                  tickFormatter={(value: number) => formatHabitMinutes(value, false)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                />
                <Tooltip
                  content={({ active, label: date }) => {
                    if (!active) return null;
                    const point = points.find((item) => item.date === date);
                    return point ? (
                      <div className="habit-tooltip">
                        <strong>{point.date}</strong>
                        <p>
                          {point.value === null
                            ? '未记录'
                            : formatHabitMinutes(point.value)}
                        </p>
                        <p>目标 {formatHabitMinutes(point.target)}</p>
                        {point.entry && (
                          <>
                            <p>{habitGrade(point.entry, rules)}</p>
                            <small>{point.entry.timezone}</small>
                          </>
                        )}
                      </div>
                    ) : null;
                  }}
                />
                <Line
                  type="stepAfter"
                  dataKey="target"
                  stroke="var(--text-secondary)"
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="habit-caption">
            实线：记录时间 · 虚线：当时目标 · 点日期查看详情
          </p>
          <details className="habit-values">
            <summary>查看每日数值</summary>
            <ul>
              {points.map((point) => (
                <li key={point.date}>
                  <button type="button" onClick={() => onSelect(point.date)}>
                    <time>{point.date}</time>
                    <span>
                      {point.value === null
                        ? '未记录'
                        : formatHabitMinutes(point.value)}
                    </span>
                    <span>{point.entry ? habitGrade(point.entry, rules) : '—'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="empty-copy">
          记录{kind === 'sleep' ? '睡觉' : '起床'}时间后查看趋势。
        </p>
      )}
    </section>
  );
}
