/** @fileoverview 历史详情与逐项补录、改归属、清除和恢复；一次保存采用原子批量命令。 */
'use client';
import { useState } from 'react';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { useHabits } from './habit-state';
import {
  EFFICIENCY_LABELS,
  KIND_LABELS,
  type Efficiency,
  type HabitChange,
  type HabitEntry,
  type HabitKind,
  type HabitRequest,
} from './habit-types';
import { habitGrade } from './habit-statistics';
import { habitAddDays, resolveHabitLocalTime } from './habit-time';

type Draft = {
  kind: HabitKind;
  entry?: HabitEntry;
  date: string;
  local: string;
  timezone: string;
  efficiency: Efficiency | '';
  mode: 'edit' | 'clear' | 'restore';
  dirty: boolean;
  choice?: 'earlier' | 'later';
};
/** 单日已有和已清除值都能查看；清除记录保留时间，恢复不丢失原始精度。 */
function createDraft(
  kind: HabitKind,
  date: string,
  entries: HabitEntry[],
  timezone: string,
): Draft {
  const matching = entries
    .filter((item) => item.kind === kind && item.business_date === date)
    .sort(
      (a, b) =>
        Number(Boolean(a.deleted_at)) - Number(Boolean(b.deleted_at)) ||
        b.updated_at.localeCompare(a.updated_at),
    );
  const entry = matching[0];
  return {
    kind,
    entry,
    date,
    local: entry?.local_time?.slice(0, 16) ?? '',
    timezone: entry?.timezone ?? timezone,
    efficiency: entry?.efficiency ?? '',
    mode: 'edit',
    dirty: false,
  };
}
/** 实际时间未编辑时沿用原始瞬间；仅显示到分钟不能丢掉首次点击的秒和毫秒。 */
export function habitDraftChange(draft: Draft): HabitChange {
  const base = {
    mode: draft.mode,
    kind: draft.kind,
    id: draft.entry?.id,
    expected_version: draft.entry?.version,
  };
  if (draft.mode !== 'edit') return base;
  const unchangedTime =
    draft.entry?.local_time?.slice(0, 16) === draft.local &&
    draft.timezone === draft.entry?.timezone;
  return {
    ...base,
    business_date: draft.date,
    timezone: draft.timezone,
    occurred_at:
      draft.kind === 'efficiency'
        ? null
        : unchangedTime
          ? draft.entry!.occurred_at
          : resolveHabitLocalTime(draft.local, draft.timezone, draft.choice),
    efficiency: draft.kind === 'efficiency' ? (draft.efficiency as Efficiency) : null,
  };
}
/** 草稿独立于后台更新；遇到版本冲突，显式重新载入后才能基于新记录编辑。 */
export function HabitEntryDialog({
  date,
  focusKind,
  onClose,
}: {
  date: string;
  focusKind?: HabitKind;
  onClose: () => void;
}) {
  const { data, save, busy, retry } = useHabits();
  const [drafts, setDrafts] = useState(() =>
    (['wake', 'sleep', 'efficiency'] as const).map((kind) =>
      createDraft(kind, date, data.entries, data.settings.timezone),
    ),
  );
  const [error, setError] = useState<string>();
  const [request, setRequest] = useState<HabitRequest | null>(null);
  /** 用户调整字段后生成新请求，未变动的失败重试沿用原请求。 */
  const update = (kind: HabitKind, patch: Partial<Draft>) => {
    setDrafts((old) =>
      old.map((item) =>
        item.kind === kind ? { ...item, mode: 'edit', ...patch, dirty: true } : item,
      ),
    );
    setRequest(null);
  };
  /** 三项修改在同一事务提交；任一失败保留全部输入。 */
  const submit = async () => {
    try {
      const changes = drafts.filter((item) => item.dirty).map(habitDraftChange);
      if (!changes.length) {
        onClose();
        return;
      }
      const next = request ?? {
        requestId: crypto.randomUUID(),
        changes,
        timezone: data.settings.timezone,
        settingsVersion: data.settings.version,
      };
      setRequest(next);
      await save(next);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '记录保存失败');
    }
  };
  return (
    <ManagementDialog
      title={`${date} ${focusKind ? KIND_LABELS[focusKind] : '习惯记录'}`}
      onClose={onClose}
      busy={busy}
      error={error}
    >
      <div className="habit-editor">
        {drafts
          .filter((draft) => !focusKind || draft.kind === focusKind)
          .map((draft) => (
            <section key={draft.kind} className="habit-editor-section">
              <header>
                <h3>{KIND_LABELS[draft.kind]}</h3>
                <span>
                  {draft.entry
                    ? draft.entry.deleted_at
                      ? '已清除'
                      : habitGrade(draft.entry, data.rules)
                    : '未记录'}
                </span>
              </header>
              {draft.entry && !focusKind && (
                <p className="habit-caption">
                  {draft.entry.source === 'automatic' ? '自动记录' : '手动补录/修改'} ·{' '}
                  {draft.entry.timezone}
                  {draft.entry.local_time
                    ? ` · ${draft.entry.local_time.replace('T', ' ')}`
                    : ''}
                </p>
              )}
              {!draft.entry?.deleted_at && (
                <>
                  {draft.kind === 'efficiency' ? (
                    <label>
                      当天工作效率
                      <select
                        aria-label="补录工作效率"
                        value={draft.efficiency}
                        onChange={(event) =>
                          update(draft.kind, {
                            efficiency: event.target.value as Efficiency,
                          })
                        }
                      >
                        <option value="">未记录</option>
                        {Object.entries(EFFICIENCY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <>
                      {focusKind && (
                        <label>
                          时间
                          <input
                            type="time"
                            aria-label={`${KIND_LABELS[draft.kind]}时间`}
                            data-management-initial-focus
                            step="60"
                            value={draft.local.slice(11, 16)}
                            onChange={(event) => {
                              const time = event.target.value;
                              const actualDate =
                                draft.kind === 'sleep' && time < '04:00'
                                  ? habitAddDays(draft.date, 1)
                                  : draft.date;
                              update(draft.kind, {
                                local: time ? `${actualDate}T${time}` : '',
                              });
                            }}
                          />
                        </label>
                      )}
                      {draft.local && draft.date && (
                        <p className="habit-caption">
                          {draft.local.slice(0, 10) === draft.date
                            ? '当天'
                            : draft.local.slice(0, 10) === habitAddDays(draft.date, 1)
                              ? '次日'
                              : '请核对实际日期'}{' '}
                          {draft.local.slice(11)} · 归属 {draft.date}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
              <details
                open={!focusKind || Boolean(draft.entry?.deleted_at)}
                className="habit-edit-more"
              >
                <summary>更多选项</summary>
                {!draft.entry?.deleted_at && (
                  <>
                    <label>
                      归属日期
                      <input
                        aria-label={`${KIND_LABELS[draft.kind]}归属日期`}
                        type="date"
                        value={draft.date}
                        onChange={(event) =>
                          update(draft.kind, { date: event.target.value })
                        }
                      />
                    </label>
                    {draft.kind !== 'efficiency' && (
                      <>
                        <label>
                          实际日期与时间
                          <input
                            aria-label={`${KIND_LABELS[draft.kind]}实际时间`}
                            type="datetime-local"
                            step="60"
                            value={draft.local}
                            onChange={(event) =>
                              update(draft.kind, { local: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          记录时区
                          <input
                            aria-label={`${KIND_LABELS[draft.kind]}时区`}
                            value={draft.timezone}
                            onChange={(event) =>
                              update(draft.kind, { timezone: event.target.value })
                            }
                          />
                        </label>
                        <details>
                          <summary>夏令时重复时间</summary>
                          <select
                            aria-label={`${KIND_LABELS[draft.kind]}重复时间选择`}
                            value={draft.choice ?? ''}
                            onChange={(event) =>
                              update(draft.kind, {
                                choice: (event.target.value ||
                                  undefined) as Draft['choice'],
                              })
                            }
                          >
                            <option value="">无重复时自动处理</option>
                            <option value="earlier">第一次</option>
                            <option value="later">第二次</option>
                          </select>
                        </details>
                      </>
                    )}
                  </>
                )}
                {draft.entry && (
                  <button
                    type="button"
                    onClick={() =>
                      update(draft.kind, {
                        mode: draft.entry!.deleted_at ? 'restore' : 'clear',
                      })
                    }
                  >
                    {draft.dirty && draft.mode !== 'edit'
                      ? draft.mode === 'clear'
                        ? '保存后清除'
                        : '保存后恢复'
                      : draft.entry.deleted_at
                        ? '恢复最近一次值'
                        : '清除这一项'}
                  </button>
                )}
              </details>
            </section>
          ))}
        {error && (
          <div className="habit-recovery">
            <button type="button" onClick={retry}>
              读取最新记录
            </button>
            <button
              type="button"
              onClick={() => {
                setDrafts((old) =>
                  old.map((draft) => ({
                    ...draft,
                    entry:
                      data.entries.find((entry) =>
                        draft.entry
                          ? entry.id === draft.entry.id
                          : !entry.deleted_at &&
                            entry.kind === draft.kind &&
                            entry.business_date === draft.date,
                      ) ?? draft.entry,
                  })),
                );
                setRequest(null);
                setError(undefined);
              }}
            >
              采用最新版本，保留草稿
            </button>
          </div>
        )}
        {!focusKind && (
          <p className="habit-caption">
            启用前的补录按初始目标统计。修改、清除和恢复均保留原始修订。
          </p>
        )}
        <button
          className="tl-button tl-button--primary"
          type="button"
          onClick={() => void submit()}
        >
          保存记录
        </button>
      </div>
    </ManagementDialog>
  );
}
