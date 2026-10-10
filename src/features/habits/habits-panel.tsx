/** @fileoverview 习惯一级栏目：当日真实时间打卡、周/月统计、效率分布和可编辑历史月历。 */
'use client';
import { useEffect, useState } from 'react';
import { CottageNavIcon } from '@/features/appearance/cottage-sprite';
import { timezoneLabel } from '@/lib/account-clock';
import { Temporal } from '@js-temporal/polyfill';
import {
  CalendarDays,
  ChartColumn,
  Sprout,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import {
  getMonthGrid,
  getMonthRange,
  getWeekRange,
  iterateLocalDateRange,
} from '@/lib/date-range';
import { useHabits } from './habit-state';
import { EFFICIENCY_LABELS, type HabitKind } from './habit-types';
import { habitAddDays, habitBusinessDate, habitLocalTime } from './habit-time';
import { habitGrade, habitRegularity, summarizeHabits } from './habit-statistics';
import { HabitToday } from './habit-today';
import { HabitDayNavigation } from './habit-day-navigation';
import { HabitTimeTrend } from './habit-trends';
import { HabitSettingsDialog } from './habit-settings-dialog';
import { HabitEntryDialog } from './habit-entry-dialog';

/** 月份移动使用民用日历，月末自动约束到有效日期。 */
function shiftMonth(date: string, amount: number): string {
  return Temporal.PlainDate.from(date).add({ months: amount }).toString();
}

/** 扩展读取保留今日和页面结构；仅已读取范围参与统计、历史显示和编辑。 */
export function HabitsPanel() {
  const state = useHabits();
  const { data, now, loading, error, notice, pending, busy, save, retry, setRange } =
    state;
  const today = habitBusinessDate(now, data.settings.timezone, 'wake');
  const businessToday = habitBusinessDate(now, data.settings.timezone, 'sleep');
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [recordDate, setRecordDate] = useState<string | null>(null);
  // 返回今天后继续跟随时钟；切换时区造成所选日期在未来时也回到当前。
  const historicalDate = recordDate && recordDate < today ? recordDate : null;
  const [historyKind, setHistoryKind] = useState<HabitKind>('sleep');
  const [editing, setEditing] = useState<{ date: string; kind: HabitKind } | null>(
    null,
  );
  /** 所有入口携带当前指标；未读取日期不能被当作空记录打开编辑。 */
  const openEntry = (date: string, kind: HabitKind) => {
    if (!isRangeReady(date, date)) return;
    setEditing({ date, kind });
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const range =
    period === 'week' ? getWeekRange(anchor ?? today) : getMonthRange(anchor ?? today);
  const grid = getMonthGrid(month ?? today);
  const fetchStart = [
    range.start,
    grid[0],
    habitAddDays(businessToday, -28),
    historicalDate ?? today,
  ].sort()[0];
  const fetchEnd = [range.end, grid.at(-1)!, today].sort().at(-1)!;
  /** 成功读取的范围才证明数据完整；新范围静态说明未就绪，不伪装成零值。 */
  const isRangeReady = (start: string, end: string) =>
    Boolean(
      state.coveredRange &&
      state.coveredRange.start <= start &&
      state.coveredRange.end >= end,
    );
  const statisticsReady = isRangeReady(range.start, range.end);
  const regularityReady = isRangeReady(habitAddDays(businessToday, -28), businessToday);
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
  const days =
    period === 'month' ? getMonthGrid(anchor ?? today) : iterateLocalDateRange(range);
  return (
    <div className="habits-panel" data-testid="habits-panel">
      <header className="habit-page-header">
        <div className="habit-page-intro">
          <h1>
            <CottageNavIcon name="habits">
              <Sprout size={32} />
            </CottageNavIcon>
            习惯
          </h1>
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
          <section className="habit-today-panel">
            <header className="habit-panel-heading">
              <div>
                <h2>
                  <CalendarDays size={24} aria-hidden="true" />
                  今日习惯
                </h2>
              </div>
              <HabitDayNavigation
                date={historicalDate ?? today}
                today={today}
                disabled={busy || Boolean(pending)}
                onChange={setRecordDate}
              />
            </header>
            <HabitToday date={historicalDate} onEdit={openEntry} />
          </section>
          <section aria-label="习惯统计" className="habit-statistics">
            <div className="habit-overview-panel">
              <header className="habit-range-header">
                <h2>
                  <ChartColumn size={24} aria-hidden="true" />
                  统计概览
                </h2>
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
                    {range.start.slice(0, 4)}年 {range.start.slice(5).replace('-', '/')}{' '}
                    – {range.end.slice(5).replace('-', '/')}
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
                      {!statisticsReady || summary[kind].rate === null
                        ? '—'
                        : `${summary[kind].rate}%`}
                    </strong>
                    <small>
                      {!statisticsReady ? (
                        '范围尚未读取'
                      ) : (
                        <>
                          {summary[kind].awaitingRules
                            ? '分档读取中'
                            : `达标 ${summary[kind].achieved}`}{' '}
                          / 已记录 {summary[kind].count}
                        </>
                      )}
                    </small>
                  </div>
                ))}
                <div>
                  <span>好状态天数</span>
                  <strong>
                    {statisticsReady ? summary.efficiency.good : '—'}
                    <small>天</small>
                  </strong>
                  <small>
                    {statisticsReady
                      ? `已记录 ${summary.efficiency.count} 天`
                      : '范围尚未读取'}
                  </small>
                </div>
              </div>
              {statisticsReady && summary.mixedTimezones && (
                <p className="habit-caption">本区间按各条记录时区统计。</p>
              )}
            </div>
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
                  ready={statisticsReady}
                  onSelect={(date) => openEntry(date, kind)}
                />
              ))}
            </div>
            <section className="habit-efficiency-trend">
              <header>
                <h2>每日状态</h2>
                <span className="habit-caption">
                  好 {statisticsReady ? summary.efficiency.good : '—'} · 中{' '}
                  {statisticsReady ? summary.efficiency.medium : '—'} · 差{' '}
                  {statisticsReady ? summary.efficiency.poor : '—'}
                </span>
              </header>
              <div className="habit-status-legend" aria-label="工作效率图例">
                <span data-status="good">好</span>
                <span data-status="medium">中</span>
                <span data-status="poor">差</span>
                <span data-status="missing">未记录</span>
              </div>
              <div className="habit-status-days">
                {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                  <span className="habit-weekday" key={day}>
                    周{day}
                  </span>
                ))}
                {days.map((date) => {
                  if (date < range.start || date > range.end)
                    return (
                      <span
                        className="habit-calendar-spacer"
                        key={date}
                        aria-hidden="true"
                      />
                    );
                  const entry = activeEntries.find(
                    (item) => item.business_date === date && item.kind === 'efficiency',
                  );
                  const dateReady = isRangeReady(date, date);
                  return (
                    <button
                      type="button"
                      key={date}
                      disabled={date > today || !dateReady}
                      data-status={
                        dateReady ? (entry?.efficiency ?? 'missing') : 'unread'
                      }
                      aria-label={`${date} 工作效率 ${!dateReady ? '尚未读取' : entry ? EFFICIENCY_LABELS[entry.efficiency!] : '未记录'}`}
                      onClick={() => openEntry(date, 'efficiency')}
                    >
                      <small>{Number(date.slice(8))}</small>
                      <strong>
                        {!dateReady
                          ? '未读'
                          : entry
                            ? EFFICIENCY_LABELS[entry.efficiency!]
                            : '—'}
                      </strong>
                    </button>
                  );
                })}
              </div>
            </section>
          </section>
          <details className="habit-regularity">
            <summary>作息规律</summary>
            {regularityReady ? (
              (['sleep', 'wake'] as const).map((kind) => (
                <p key={kind}>
                  {kind === 'wake' ? '起床：' : '睡觉：'}
                  {habitRegularity(data.entries, data.rules, businessToday, kind)}
                </p>
              ))
            ) : (
              <p className="habit-caption">作息比较范围尚未读取。</p>
            )}
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
                const dateReady = isRangeReady(date, date);
                const entry = activeEntries.find(
                  (item) => item.business_date === date && item.kind === historyKind,
                );
                const grade = !dateReady
                  ? '尚未读取'
                  : entry
                    ? habitGrade(entry, data.rules)
                    : '未记录';
                return (
                  <button
                    type="button"
                    key={date}
                    aria-label={`${date} ${grade}`}
                    disabled={date > today || !dateReady}
                    data-outside={date.slice(0, 7) !== (month ?? today).slice(0, 7)}
                    data-today={date === today}
                    data-status={grade}
                    onClick={() => openEntry(date, historyKind)}
                  >
                    <time>{Number(date.slice(8))}</time>
                    <small>{grade === '未记录' ? '—' : grade}</small>
                  </button>
                );
              })}
            </div>
            <p className="habit-caption">点日期编辑所选项目；— 表示未记录。</p>
          </details>
        </>
      )}
      {settingsOpen && <HabitSettingsDialog onClose={() => setSettingsOpen(false)} />}
      {editing && (
        <HabitEntryDialog
          key={`${editing.date}:${editing.kind}`}
          date={editing.date}
          focusKind={editing.kind}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
