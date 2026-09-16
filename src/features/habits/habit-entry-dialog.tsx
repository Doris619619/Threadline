/** @fileoverview 习惯单项编辑：时间优先，日期、时区、清除与恢复按需展开，保留版本化写入。 */
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
import {
  habitActualTimeLabel,
  habitLocalForClock,
  resolveHabitLocalTime,
} from './habit-time';

type Draft = {
  kind: HabitKind;
  entry?: HabitEntry;
  date: string;
  local: string;
  clock?: string;
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
  if (draft.kind !== 'efficiency' && !draft.local)
    throw new Error('请输入有效时间，例如 23:48 或 00:12');
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
  focusKind: HabitKind;
  onClose: () => void;
}) {
  const { data, save, busy, retry } = useHabits();
  const [drafts, setDrafts] = useState(() => [
    createDraft(focusKind, date, data.entries, data.settings.timezone),
  ]);
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
  /** 只提交当前项目，失败保留输入和请求 ID，不影响同日另外两项。 */
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
      title={`${date} ${KIND_LABELS[focusKind]}`}
      onClose={onClose}
      busy={busy}
      error={error}
    >
      <div className="habit-editor habit-editor--single">
        {drafts.map((draft) => (
          <section key={draft.kind} className="habit-editor-section">
            {!draft.entry?.deleted_at && (
              <>
                {draft.kind === 'efficiency' ? (
                  <label>
                    当天工作效率
                    <select
                      aria-label="补录工作效率"
                      data-management-initial-focus
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
                    <label>
                      时间
                      <input
                        type="text"
                        inputMode="text"
                        placeholder="23:48"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={`${KIND_LABELS[draft.kind]}时间`}
                        data-management-initial-focus
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void submit();
                          }
                        }}
                        value={draft.clock ?? draft.local.slice(11, 16)}
                        onChange={(event) => {
                          const clock = event.target.value;
                          let local = '';
                          try {
                            local = habitLocalForClock(draft.date, draft.kind, clock);
                          } catch {
                            // 保留逐字输入的半成品，保存时才报告格式错误。
                          }
                          update(draft.kind, {
                            clock,
                            local,
                          });
                        }}
                      />
                    </label>
                    {draft.local && draft.date && (
                      <p className="habit-caption">
                        {habitActualTimeLabel(draft.local)}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            <details
              open={Boolean(draft.entry?.deleted_at)}
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
                            update(draft.kind, {
                              local: event.target.value,
                              clock: undefined,
                            })
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
        {error && request && (
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
        <div className="habit-editor-actions">
          <button
            className="tl-button tl-button--primary"
            type="button"
            onClick={() => void submit()}
          >
            保存记录
          </button>
        </div>
      </div>
    </ManagementDialog>
  );
}
