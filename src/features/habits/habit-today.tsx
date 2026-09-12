/** @fileoverview 习惯当天三行打卡：冻结点击时间，原位反馈，已记录时间直接编辑。 */
'use client';
import { Moon, Sunrise } from 'lucide-react';
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

/** 今日归属独立于历史筛选，睡觉和效率在账号时区的 04:00 分日。 */
export function HabitToday({
  onEdit,
}: {
  onEdit: (date: string, kind: HabitKind) => void;
}) {
  const { data, now, pending, busy, save } = useHabits();
  const today = habitBusinessDate(now, data.settings.timezone, 'wake');
  const businessToday = habitBusinessDate(now, data.settings.timezone, 'sleep');
  const activeEntries = data.entries.filter((entry) => !entry.deleted_at);
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
    <section className="habit-today" aria-label="今天打卡">
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
          <div className="habit-check-row" key={kind} data-testid={`habit-${kind}`}>
            {kind === 'wake' ? (
              <Sunrise aria-hidden="true" size={22} />
            ) : (
              <Moon aria-hidden="true" size={22} />
            )}
            <div className="habit-check-label">
              <strong>{kind === 'wake' ? '起床' : '睡觉'}</strong>
              <small>
                {date !== today ? `${date.slice(5).replace('-', '月')}日 · ` : ''}
                目标{' '}
                {formatHabitMinutes(
                  kind === 'sleep' ? rule.sleep_target : rule.wake_target,
                )}
              </small>
            </div>
            <div className="habit-record-value">
              {entry && !pendingChange ? (
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
              ) : pendingChange ? (
                <strong>{formatHabitMinutes(value!, false)}</strong>
              ) : (
                <button
                  type="button"
                  className="habit-record-button"
                  disabled={busy || Boolean(pending)}
                  onClick={() => record(kind)}
                >
                  {kind === 'wake' ? '起床了' : '睡觉了'}
                </button>
              )}
              {(entry || pendingChange) && (
                <small>
                  {pendingChange
                    ? busy
                      ? '保存中…'
                      : '尚未保存'
                    : habitGrade(entry!, data.rules)}
                </small>
              )}
            </div>
          </div>
        );
      })}
      <div className="habit-efficiency-row">
        <div>
          <strong>工作效率</strong>
          <small>
            {businessToday !== today ? `${businessToday.slice(5)} · ` : ''}
            当天工作状态
          </small>
        </div>
        <div className="habit-segments" aria-label="当天工作效率">
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
  );
}
