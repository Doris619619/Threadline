/** @fileoverview 习惯一级栏目：当日真实时间打卡、周/月统计、效率分布和可编辑历史月历。 */
'use client';
import { useEffect, useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import {
  ChevronLeft,
  ChevronRight,
  Moon,
  SlidersHorizontal,
  Sunrise,
} from 'lucide-react';
import {
  getMonthGrid,
  getMonthRange,
  getWeekRange,
  iterateLocalDateRange,
} from '@/lib/date-range';
import { useHabits } from './habit-state';
import {
  EFFICIENCY_LABELS,
  type Efficiency,
  type HabitChange,
  type HabitKind,
} from './habit-types';
import {
  formatHabitMinutes,
  habitAddDays,
  habitBusinessDate,
  habitLocalTime,
  habitMinutes,
} from './habit-time';
import {
  habitGrade,
  habitRegularity,
  habitRuleForDate,
  summarizeHabits,
} from './habit-statistics';
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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
  /** 一键时间在事件处理开始时冻结；效率已有记录使用版本化编辑，不产生重复行。 */
  const record = (kind: HabitKind, efficiency?: Efficiency) => {
    const capturedAt = new Date().toISOString();
    const date = habitBusinessDate(capturedAt, data.settings.timezone, kind);
    const existing = activeEntries.find(
      (entry) => entry.kind === kind && entry.business_date === date,
    );
    const change: HabitChange = {
      mode: 'record',
      kind,
      occurred_at: capturedAt,
      efficiency,
      ...(kind === 'efficiency' && existing
        ? { id: existing.id, expected_version: existing.version }
        : {}),
    };
    void save({
      requestId: crypto.randomUUID(),
      changes: [change],
      timezone: data.settings.timezone,
      settingsVersion: data.settings.version,
    }).catch(() => undefined);
  };
  return (
    <div className="habits-panel" data-testid="habits-panel">
      <header className="habit-page-header">
        <h1>习惯</h1>
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
          <section className="habit-today" aria-label="今天打卡">
            <header>
              <h2>
                今天 <time>{today}</time>
              </h2>
              <span className="habit-caption">{data.settings.timezone}</span>
            </header>
            {(['wake', 'sleep'] as const).map((kind) => {
              const pendingChange = pending?.changes.find(
                (change) => change.kind === kind && change.mode === 'record',
              );
              const date = pendingChange?.occurred_at
                ? habitBusinessDate(pendingChange.occurred_at, pending!.timezone, kind)
                : habitBusinessDate(now, data.settings.timezone, kind);
              const entry = activeEntries.find(
                (item) => item.kind === kind && item.business_date === date,
              );
              const rule = habitRuleForDate(data.rules, date);
              const value = pendingChange?.occurred_at
                ? habitMinutes(
                    habitLocalTime(pendingChange.occurred_at, pending!.timezone),
                    date,
                    kind,
                  )
                : entry?.local_time
                  ? habitMinutes(entry.local_time, date, kind)
                  : null;
              return (
                <div
                  className="habit-check-row"
                  key={kind}
                  data-testid={`habit-${kind}`}
                >
                  {kind === 'wake' ? (
                    <Sunrise aria-hidden="true" size={22} />
                  ) : (
                    <Moon aria-hidden="true" size={22} />
                  )}
                  <div className="habit-check-label">
                    <strong>{kind === 'wake' ? '起床' : '睡觉'}</strong>
                    <small>
                      {date}
                      {kind === 'sleep' ? ' 晚' : ''} · 目标{' '}
                      {formatHabitMinutes(
                        kind === 'sleep' ? rule.sleep_target : rule.wake_target,
                      )}
                    </small>
                  </div>
                  <div className="habit-record-value">
                    <strong>
                      {value === null ? '--:--' : formatHabitMinutes(value)}
                    </strong>
                    <small>
                      {pendingChange
                        ? busy
                          ? '保存中…'
                          : '尚未保存'
                        : entry
                          ? habitGrade(entry, data.rules)
                          : '未记录'}
                    </small>
                  </div>
                  <button
                    type="button"
                    className={entry ? 'habit-edit-button' : 'habit-record-button'}
                    disabled={busy || Boolean(pending)}
                    onClick={() => (entry ? setSelectedDate(date) : record(kind))}
                  >
                    {entry ? '修改' : kind === 'wake' ? '起床了' : '睡觉了'}
                  </button>
                </div>
              );
            })}
            <div className="habit-efficiency-row">
              <div>
                <strong>每日状态</strong>
                <small>{businessToday} · 当天工作效率</small>
              </div>
              <div className="habit-segments" aria-label="当天工作效率">
                {Object.entries(EFFICIENCY_LABELS).map(([value, label]) => {
                  const selected =
                    pending?.changes.find((change) => change.kind === 'efficiency')
                      ?.efficiency ??
                    activeEntries.find(
                      (entry) =>
                        entry.kind === 'efficiency' &&
                        entry.business_date === businessToday,
                    )?.efficiency;
                  return (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={selected === value}
                      disabled={busy || Boolean(pending)}
                      onClick={() => record('efficiency', value as Efficiency)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {pending?.changes.some((change) => change.kind === 'efficiency') && (
              <p role="status" className="habit-caption">
                {busy ? '状态保存中…' : '状态尚未保存'}
              </p>
            )}
          </section>
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
                  {range.start} — {range.end}
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
                    达标 {summary[kind].achieved} / 已记录 {summary[kind].count}
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
                      <small>{date.slice(5)}</small>
                      <strong>
                        {entry ? EFFICIENCY_LABELS[entry.efficiency!] : '—'}
                      </strong>
                    </button>
                  );
                })}
              </div>
            </section>
          </section>
          <section className="habit-regularity">
            <h2>规律</h2>
            {(['sleep', 'wake'] as const).map((kind) => (
              <p key={kind}>
                {kind === 'wake' ? '起床：' : '睡觉：'}
                {habitRegularity(data.entries, data.rules, businessToday, kind)}
              </p>
            ))}
          </section>
          <section className="habit-history">
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
          </section>
        </>
      )}
      {settingsOpen && <HabitSettingsDialog onClose={() => setSettingsOpen(false)} />}
      {selectedDate && (
        <HabitEntryDialog
          key={selectedDate}
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
