/** @fileoverview 始终展示 Daily 父子执行行：预计只读、实际逐项填写、父级汇总。 */

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  getDailyActualMinutes,
  getDailyPlannedMinutes,
  isDailyCompleted,
  setDailyChildCompleted,
  setDailyCompleted,
} from '@/features/daily/daily-rules';
import { useDailyExecution } from '@/features/daily/use-daily-execution';
import type { Daily, DailyHistoryEntry } from '@/features/daily/types';

/** 展示固定预计值，不把没有计划的清单误报成有计划。 */
function plannedLabel(value: number) {
  return value > 0 ? '预计 ' + value + ' 分钟' : '预计未设置';
}

/** 分钟输入具有可见标签和数字键盘，失焦提交而不逐键刷新服务器状态。 */
function ActualMinutes({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="daily-actual-field">
      <span>实际</span>
      <Input
        aria-label={label}
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={value}
        placeholder="—"
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <span>分钟</span>
    </label>
  );
}

/** 所有子项和记录字段直接显示；提交时禁用完成动作，仍允许编辑输入草稿。 */
export function DailyExecutionRow({
  daily,
  date,
  recorded,
  onSave,
  onRecord,
}: {
  daily: Daily;
  date: string;
  recorded: boolean;
  onSave: (daily: Daily, date: string) => Promise<void>;
  onRecord: (entry: DailyHistoryEntry) => Promise<void>;
}) {
  const { draft, edit, flush, save, saving, error, setError } = useDailyExecution(
    daily,
    date,
    onSave,
  );
  const [recording, setRecording] = useState(false);
  const complete = isDailyCompleted(draft.daily);
  const hasChildren = draft.daily.children.length > 0;
  const displayTotal =
    (Number(draft.actual) || 0) +
    draft.childrenActual.reduce((sum, value) => sum + (Number(value) || 0), 0);

  /** 先保存最新输入，再生成当天唯一正式记录；失败不清空输入。 */
  const record = async () => {
    if (recording || recorded) return;
    setRecording(true);
    try {
      const next = await flush();
      await onRecord({
        dailyId: daily.id,
        date,
        completed: isDailyCompleted(next),
        actual: getDailyActualMinutes(next),
        result: next.result,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '记录失败，请重试。');
    } finally {
      setRecording(false);
    }
  };

  return (
    <section className="daily-group" aria-label={'Daily ' + daily.title}>
      <div className="daily-parent">
        <Checkbox
          className="daily-circle"
          aria-label={'完成 Daily ' + daily.title}
          checked={complete}
          disabled={saving || recording}
          onChange={(event) => {
            edit((value) => ({
              ...value,
              daily: setDailyCompleted(value.daily, event.target.checked),
            }));
            save();
          }}
        />
        <h3 className="daily-parent-title">{daily.title}</h3>
        <span className="daily-completion-state">
          {complete ? '今日已完成' : '待完成'}
        </span>
      </div>
      <div className="daily-total">
        <span>{plannedLabel(getDailyPlannedMinutes(draft.daily))}</span>
        {hasChildren ? (
          <span>
            实际合计 <strong>{displayTotal}</strong> 分钟
          </span>
        ) : (
          <ActualMinutes
            label={daily.title + '实际耗时'}
            value={draft.actual}
            onChange={(actual) => edit((value) => ({ ...value, actual }))}
            onBlur={save}
          />
        )}
      </div>
      {hasChildren && (
        <div className="daily-children">
          {draft.daily.children.map((child, index) => (
            <div
              className="daily-child-row"
              key={child.id ?? child.templateItemId ?? index}
            >
              <div className="daily-child-heading">
                <Checkbox
                  className="daily-circle"
                  aria-label={'完成 ' + child.title}
                  checked={child.completed}
                  disabled={saving || recording}
                  onChange={(event) => {
                    edit((value) => ({
                      ...value,
                      daily: setDailyChildCompleted(
                        value.daily,
                        index,
                        event.target.checked,
                      ),
                    }));
                    save();
                  }}
                />
                <span className="daily-child-name">{child.title}</span>
              </div>
              <div className="daily-child-minutes">
                <span>{plannedLabel(child.plannedDurationMinutes ?? 0)}</span>
                <ActualMinutes
                  label={daily.title + ' ' + child.title + '实际耗时'}
                  value={draft.childrenActual[index]}
                  onChange={(actual) =>
                    edit((value) => ({
                      ...value,
                      childrenActual: value.childrenActual.map((old, childIndex) =>
                        childIndex === index ? actual : old,
                      ),
                    }))
                  }
                  onBlur={save}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {hasChildren && daily.actual > 0 && (
        <p className="daily-legacy-minutes">
          原有额外耗时 {daily.actual} 分钟，已计入合计
        </p>
      )}
      <div className="daily-entry">
        <label className="daily-result-field">
          <span>今日结果</span>
          <textarea
            aria-label={daily.title + '今日结果'}
            rows={2}
            value={draft.daily.result}
            placeholder="记录今天的收获"
            onChange={(event) =>
              edit((value) => ({
                ...value,
                daily: { ...value.daily, result: event.target.value },
              }))
            }
            onBlur={save}
          />
        </label>
        <div className="daily-entry-actions">
          <span role="status">{saving ? '正在保存…' : ''}</span>
          <button
            type="button"
            disabled={recorded || recording}
            onClick={() => void record()}
          >
            {recorded ? '已记录' : recording ? '正在记录…' : '记录'}
          </button>
        </div>
      </div>
      {error && (
        <div className="daily-save-error" role="alert">
          <span>{error}</span>
          <button type="button" disabled={saving} onClick={save}>
            重试保存
          </button>
        </div>
      )}
    </section>
  );
}
