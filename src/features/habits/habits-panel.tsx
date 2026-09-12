/** @fileoverview 习惯一级栏目：当日真实时间打卡、周/月统计、效率分布和可编辑历史月历。 */
'use client';
import { useEffect, useState } from 'react';
import { timezoneLabel } from '@/lib/account-clock';
import { Temporal } from '@js-temporal/polyfill';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import {
  getMonthGrid,
  getMonthRange,
  getWeekRange,
  iterateLocalDateRange,
} from '@/lib/date-range';
import { useHabits } from './habit-state';
import { EFFICIENCY_LABELS, type HabitKind } from './habit-types';
import {
  habitAddDays,
  habitBusinessDate,
  habitLocalTime,
} from './habit-time';
import { habitGrade, habitRegularity, summarizeHabits } from './habit-statistics';
import { HabitToday } from './habit-today';
import { HabitTimeTrend } from './habit-trends';
import { HabitSettingsDialog } from './habit-settings-dialog';
import { HabitEntryDialog } from './habit-entry-dialog';

/** 月份移动使用民用日历，月末自动约束到有效日期。 */
function shiftMonth(date: string, amount: number): string {
  return Temporal.PlainDate.from(date).add({ months: amount }).toString();
}

/** 今日打卡与历史选择相互独立，切换图表范围不能把当前点击写入历史日期。 */
export function HabitsPanel() {
  const state = useHabits();
  const { data, now, loading, error, notice, pending, busy, save, retry, setRange } =
    state;
  const today = habitBusinessDate(now, data.settings.timezone, 'wake');
  const businessToday = habitBusinessDate(now, data.settings.timezone, 'sleep');
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [historyKind, setHistoryKind] = useState<HabitKind>('sleep');
  const [editingKind, setEditingKind] = useState<HabitKind | undefined>();
  const [selectedDate, selectDate] = useState<string | null>(null);
  /** 日期入口显示完整详情，时间入口只编辑所选项目。 */
  const setSelectedDate = (date: string | null) => {
    setEditingKind(undefined);
    selectDate(date);
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const range =
    period === 'week' ? getWeekRange(anchor ?? today) : getMonthRange(anchor ?? today);
  const grid = getMonthGrid(month ?? today);
  const fetchStart = [range.start, grid[0], habitAddDays(businessToday, -28)].sort()[0];
  const fetchEnd = [range.end, grid.at(-1)!, today].sort().at(-1)!;
  useEffect(() => {
    setRange(fetchStart, fetchEnd);
  }, [fetchStart, fetchEnd, setRange]);
  const summary = summarizeHabits(
    data.entries,
    data.rules,
    range.start,
    range.end,
    today,
  );
  const activeEntries = data.entries.filter((entry) => !entry.deleted_at);
  const days = iterateLocalDateRange(range);
  return (
    <div className="habits-panel" data-testid="habits-panel">
      <header className="habit-page-header">
        <div>
          <h1>习惯</h1>
          <div className="habit-live-clock" data-testid="habit-clock">
            <time dateTime={now}>
              {new Intl.DateTimeFormat('zh-CN', {
                timeZone: data.settings.timezone,
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              }).format(new Date(now))}
              <b>{habitLocalTime(now, data.settings.timezone).slice(11, 19)}</b>
            </time>
            <span>{timezoneLabel(data.settings.timezone)}</span>
          </div>
        </div>
        <button
          type="button"
          aria-label="习惯设置"
          onClick={() => setSettingsOpen(true)}
          disabled={!state.ready || busy || Boolean(pending)}
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          设置
        </button>
      </header>
      {loading ? (
        <p role="status">正在读取习惯记录…</p>
      ) : !state.ready ? (
        <div role="alert">
          <p>{error ?? '习惯记录尚未加载'}</p>
          <button type="button" onClick={retry}>
            重新读取
          </button>
        </div>
      ) : (
        <>
          {(error || notice) && (
            <div className="habit-message" role={error ? 'alert' : 'status'}>
              <p>{error ?? notice}</p>
              {pending ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(pending).catch(() => undefined)}
                >
                  重试原记录
                </button>
              ) : (
                <button type="button" onClick={retry}>
                  重新读取
                </button>
              )}
              {pending && (
                <button type="button" disabled={busy} onClick={state.discard}>
                  丢弃待保存输入
                </button>
              )}
              {pending && (
                <button type="button" disabled={busy} onClick={retry}>
                  重新读取
                </button>
              )}
              {pending && pending.settingsVersion !== data.settings.version && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void save({
                      ...pending,
                      requestId: crypto.randomUUID(),
                      timezone: data.settings.timezone,
                      settingsVersion: data.settings.version,
                    }).catch(() => undefined)
                  }
                >
                  按最新设置重试原时间
                </button>
              )}
            </div>
          )}
          <HabitToday
            onEdit={(date, kind) => {
              setEditingKind(kind);
              selectDate(date);
            }}
          />
          <section aria-label="习惯统计" className="habit-statistics">
            <header className="habit-range-header">
              <h2>{anchor ? '统计' : period === 'week' ? '本周' : '本月'}</h2>
              <div className="habit-segments" aria-label="习惯统计范围">
                <button
                  type="button"
                  aria-pressed={period === 'week'}
                  onClick={() => setPeriod('week')}
                >
                  周
                </button>
                <button
                  type="button"
                  aria-pressed={period === 'month'}
                  onClick={() => setPeriod('month')}
                >
                  月
                </button>
              </div>
              <div className="habit-range-navigation">
                <button
                  type="button"
                  aria-label="上个统计周期"
                  onClick={() =>
                    setAnchor(
                      period === 'week'
                        ? habitAddDays(anchor ?? today, -7)
                        : shiftMonth(anchor ?? today, -1),
                    )
                  }
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {range.start.slice(0, 4)}年 {range.start.slice(5).replace('-', '/')} –{' '}
                  {range.end.slice(5).replace('-', '/')}
                </span>
                <button
                  type="button"
                  aria-label="下个统计周期"
                  disabled={range.end >= today}
                  onClick={() =>
                    setAnchor(
                      period === 'week'
                        ? habitAddDays(anchor ?? today, 7)
                        : shiftMonth(anchor ?? today, 1),
                    )
                  }
                >
                  <ChevronRight size={18} />
                </button>
                {anchor && (
                  <button type="button" onClick={() => setAnchor(null)}>
                    回到当前
                  </button>
                )}
              </div>
            </header>
            <div className="habit-summary">
              {(['sleep', 'wake'] as const).map((kind) => (
                <div key={kind}>
                  <span>{kind === 'sleep' ? '早睡达标率' : '早起达标率'}</span>
                  <strong>
                    {summary[kind].rate === null ? '—' : `${summary[kind].rate}%`}
                  </strong>
                  <small>
                    {summary[kind].awaitingRules
                      ? '分档读取中'
                      : `达标 ${summary[kind].achieved}`}{' '}
                    / 已记录 {summary[kind].count}
                  </small>
                </div>
              ))}
              <div>
                <span>好状态</span>
                <strong>
                  {summary.efficiency.good}
                  <small>天</small>
                </strong>
                <small>已记录 {summary.efficiency.count} 天</small>
              </div>
            </div>
            <p className="habit-caption">
              达标率仅计算已记录日，漏记不计入分母。
              {summary.mixedTimezones ? '本区间按各条记录时区统计。' : ''}
            </p>
            <div className="habit-trends">
              {(['sleep', 'wake'] as const).map((kind) => (
                <HabitTimeTrend
                  key={kind}
                  kind={kind}
                  entries={data.entries}
                  rules={data.rules}
                  start={range.start}
                  end={range.end < today ? range.end : today}
                  average={summary[kind].average}
                  count={summary[kind].count}
                  onSelect={setSelectedDate}
                />
              ))}
            </div>
            <section className="habit-efficiency-trend">
              <header>
                <h2>每日状态</h2>
                <span className="habit-caption">
                  好 {summary.efficiency.good} · 中 {summary.efficiency.medium} · 差{' '}
                  {summary.efficiency.poor}
                </span>
              </header>
              <div className="habit-status-days">
                {days.map((date) => {
                  const entry = activeEntries.find(
                    (item) => item.business_date === date && item.kind === 'efficiency',
                  );
                  return (
                    <button
                      type="button"
                      key={date}
                      disabled={date > today}
                      data-status={entry?.efficiency ?? 'missing'}
                      aria-label={`${date} 工作效率 ${entry ? EFFICIENCY_LABELS[entry.efficiency!] : '未记录'}`}
                      onClick={() => setSelectedDate(date)}
                    >
                      <small>{Number(date.slice(8))}日</small>
                      <strong>
                        {entry ? EFFICIENCY_LABELS[entry.efficiency!] : '—'}
                      </strong>
                    </button>
                  );
                })}
              </div>
            </section>
          </section>
          <details className="habit-regularity">
            <summary>作息规律</summary>
            {(['sleep', 'wake'] as const).map((kind) => (
              <p key={kind}>
                {kind === 'wake' ? '起床：' : '睡觉：'}
                {habitRegularity(data.entries, data.rules, businessToday, kind)}
              </p>
            ))}
          </details>
          <details className="habit-history">
            <summary>历史与补录</summary>
            <header>
              <h2>历史</h2>
              <div className="habit-range-navigation">
                <button
                  type="button"
                  aria-label="上个月历史"
                  onClick={() => setMonth(shiftMonth(month ?? today, -1))}
                >
                  <ChevronLeft size={18} />
                </button>
                <strong>{(month ?? today).slice(0, 7)}</strong>
                <button
                  type="button"
                  aria-label="下个月历史"
                  disabled={(month ?? today).slice(0, 7) >= today.slice(0, 7)}
                  onClick={() => setMonth(shiftMonth(month ?? today, 1))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </header>
            <div className="habit-segments" aria-label="历史指标">
              {(
                [
                  ['sleep', '睡觉'],
                  ['wake', '起床'],
                  ['efficiency', '效率'],
                ] as const
              ).map(([kind, label]) => (
                <button
                  type="button"
                  key={kind}
                  aria-pressed={historyKind === kind}
                  onClick={() => setHistoryKind(kind)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="habit-calendar" aria-label="习惯历史月历">
              {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                <span className="habit-weekday" key={day}>
                  {day}
                </span>
              ))}
              {grid.map((date) => {
                const entry = activeEntries.find(
                  (item) => item.business_date === date && item.kind === historyKind,
                );
                const grade = entry ? habitGrade(entry, data.rules) : '未记录';
                return (
                  <button
                    type="button"
                    key={date}
                    aria-label={`${date} ${grade}`}
                    disabled={date > today}
                    data-outside={date.slice(0, 7) !== (month ?? today).slice(0, 7)}
                    data-today={date === today}
                    data-status={grade}
                    onClick={() => setSelectedDate(date)}
                  >
                    <time>{Number(date.slice(8))}</time>
                    <small>{grade === '未记录' ? '—' : grade}</small>
                  </button>
                );
              })}
            </div>
            <p className="habit-caption">点日期查看、补录或修改；— 表示未记录。</p>
          </details>
        </>
      )}
      {settingsOpen && <HabitSettingsDialog onClose={() => setSettingsOpen(false)} />}
      {selectedDate && (
        <HabitEntryDialog
          key={selectedDate}
          date={selectedDate}
          focusKind={editingKind}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
