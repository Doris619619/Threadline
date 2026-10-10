/** @fileoverview 习惯三行记录：当前日冻结点击时间，历史日逐项补录，已记录时间直接编辑。 */
'use client';
import { Moon, Sunrise, Laptop } from 'lucide-react';
import { useHabits } from './habit-state';
import {
  EFFICIENCY_LABELS,
  type Efficiency,
  type HabitChange,
  type HabitKind,
} from './habit-types';
import {
  formatHabitMinutes,
  habitBusinessDate,
  habitLocalTime,
  habitMinutes,
} from './habit-time';
import { habitGrade, habitRuleForDate } from './habit-statistics';

/** 打卡保留冻结值与同一个时间按钮；失败说明持续到确认，未读日期不能编辑。 */
export function HabitToday({
  date: historicalDate = null,
  onEdit,
}: {
  date?: string | null;
  onEdit: (date: string, kind: HabitKind) => void;
}) {
  const { data, coveredRange, now, pending, busy, error, save } = useHabits();
  const today = habitBusinessDate(now, data.settings.timezone, 'wake');
  const businessToday =
    historicalDate ?? habitBusinessDate(now, data.settings.timezone, 'sleep');
  const activeEntries = data.entries.filter((entry) => !entry.deleted_at);
  /** 缓存仅证明已读取范围；不能将扩展范围中尚未读取的日期当作未记录。 */
  const isDateReady = (date: string) =>
    Boolean(coveredRange && date >= coveredRange.start && date <= coveredRange.end);
  /** 一键时间只用于当前日；历史效率显式提交业务日期，不以当前时钟推算归属。 */
  const record = (kind: HabitKind, efficiency?: Efficiency) => {
    if (historicalDate && kind !== 'efficiency') {
      onEdit(historicalDate, kind);
      return;
    }
    const capturedAt = new Date().toISOString();
    const date =
      historicalDate ?? habitBusinessDate(capturedAt, data.settings.timezone, kind);
    const existing = activeEntries.find(
      (entry) => entry.kind === kind && entry.business_date === date,
    );
    const change: HabitChange = {
      mode: historicalDate ? 'edit' : 'record',
      kind,
      occurred_at: capturedAt,
      efficiency,
      ...(historicalDate
        ? {
            business_date: historicalDate,
            timezone: existing?.timezone ?? data.settings.timezone,
          }
        : {}),
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
    <section
      className="habit-today"
      aria-busy={busy}
      aria-label={historicalDate ? `${historicalDate} 习惯记录` : '今天打卡'}
    >
      {(['wake', 'sleep'] as const).map((kind) => {
        const pendingChange = pending?.changes.find(
          (change) =>
            change.kind === kind && change.mode === 'record' && !historicalDate,
        );
        const date = pendingChange?.occurred_at
          ? habitBusinessDate(pendingChange.occurred_at, pending!.timezone, kind)
          : (historicalDate ?? habitBusinessDate(now, data.settings.timezone, kind));
        const entry = activeEntries.find(
          (item) => item.kind === kind && item.business_date === date,
        );
        const rule = habitRuleForDate(data.rules, date);
        const dateReady = isDateReady(date);
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
          <div className="habit-check-row" key={kind} data-testid={`habit-${kind}`}>
            {kind === 'wake' ? (
              <Sunrise aria-hidden="true" size={22} />
            ) : (
              <Moon aria-hidden="true" size={22} />
            )}
            <div className="habit-check-label">
              <strong>{kind === 'wake' ? '起床' : '睡觉'}</strong>
              <small>
                {!historicalDate && date !== today
                  ? `${date.slice(5).replace('-', '月')}日 · `
                  : ''}
                目标{' '}
                {formatHabitMinutes(
                  kind === 'sleep' ? rule.sleep_target : rule.wake_target,
                )}
              </small>
            </div>
            <div className="habit-record-value">
              {!dateReady ? (
                <span>该日期记录尚未读取</span>
              ) : entry || pendingChange ? (
                <button
                  type="button"
                  className="habit-time-button"
                  aria-label={`编辑${kind === 'wake' ? '起床' : '睡觉'}时间 ${formatHabitMinutes(value!, false)}`}
                  disabled={busy || Boolean(pending)}
                  onClick={() => {
                    onEdit(date, kind);
                  }}
                >
                  {formatHabitMinutes(value!, false)}
                </button>
              ) : (
                <button
                  type="button"
                  className={
                    historicalDate ? 'habit-backfill-button' : 'habit-record-button'
                  }
                  aria-label={
                    historicalDate
                      ? `补录${kind === 'wake' ? '起床' : '睡觉'}时间`
                      : undefined
                  }
                  disabled={busy || Boolean(pending)}
                  onClick={() => record(kind)}
                >
                  {historicalDate ? '补录' : kind === 'wake' ? '起床了' : '睡觉了'}
                </button>
              )}
              {dateReady && (entry || pendingChange) && (
                <small>
                  {pendingChange
                    ? error
                      ? '尚未保存'
                      : entry
                        ? habitGrade(entry, data.rules)
                        : null
                    : habitGrade(entry!, data.rules)}
                </small>
              )}
            </div>
          </div>
        );
      })}
      <div className="habit-efficiency-row">
        <Laptop aria-hidden="true" size={24} />
        <div className="habit-efficiency-label">
          <strong>工作效率</strong>
          <small>
            {!historicalDate && businessToday !== today
              ? `${businessToday.slice(5)} · `
              : ''}
            当天工作状态
          </small>
        </div>
        <div
          className="habit-segments"
          aria-label={historicalDate ? `${historicalDate} 工作效率` : '当天工作效率'}
        >
          {Object.entries(EFFICIENCY_LABELS).map(([value, label]) => {
            const selected =
              pending?.changes.find((change) => change.kind === 'efficiency')
                ?.efficiency ??
              activeEntries.find(
                (entry) =>
                  entry.kind === 'efficiency' && entry.business_date === businessToday,
              )?.efficiency;
            return (
              <button
                type="button"
                key={value}
                aria-pressed={selected === value}
                disabled={busy || Boolean(pending) || !isDateReady(businessToday)}
                onClick={() => record('efficiency', value as Efficiency)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {error && pending?.changes.some((change) => change.kind === 'efficiency') && (
        <p role="status" className="habit-caption">
          状态尚未保存
        </p>
      )}
    </section>
  );
}
