/** @fileoverview 首页 Daily 复用项目页的内嵌清单层级，勾选与耗时自动保存。 */

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  getDailyPlannedMinutes,
  isDailyCompleted,
  setDailyChildCompleted,
  setDailyCompleted,
} from '@/features/daily/daily-rules';
import { useDailyExecution } from '@/features/daily/use-daily-execution';
import type { Daily } from '@/features/daily/types';

/** 未设置预计时长时省略空信息，给任务内容留出空间。 */
function PlannedMinutes({ minutes }: { minutes: number }) {
  return minutes > 0 ? (
    <span className="daily-planned">预计 {minutes} 分钟</span>
  ) : null;
}

/** 右侧独立耗时列以可见标签说明单位，失焦自动保存并保留数字键盘。 */
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
      <span>实际 · 分钟</span>
      <Input
        aria-label={label}
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={value}
        placeholder="填写"
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}

/** 展示父级汇总和常显子项；历史快照由结束今天统一生成，不设额外记录操作。 */
export function DailyExecutionRow({
  daily,
  date,
  onSave,
}: {
  daily: Daily;
  date: string;
  onSave: (daily: Daily, date: string) => Promise<void>;
}) {
  const { draft, edit, save, saving, error } = useDailyExecution(daily, date, onSave);
  const hasChildren = draft.daily.children.length > 0;
  const hasActual =
    draft.actual !== '' || draft.childrenActual.some((value) => value !== '');
  const total =
    (Number(draft.actual) || 0) +
    draft.childrenActual.reduce((sum, value) => sum + (Number(value) || 0), 0);
  return (
    <section className="daily-group" aria-label={'Daily ' + daily.title}>
      <div className="daily-parent">
        <Checkbox
          className="daily-check"
          aria-label={'完成 Daily ' + daily.title}
          checked={isDailyCompleted(draft.daily)}
          disabled={saving}
          onChange={(event) => {
            edit((value) => ({
              ...value,
              daily: setDailyCompleted(value.daily, event.target.checked),
            }));
            save();
          }}
        />
        <div className="daily-parent-copy">
          <h3 className="daily-parent-title">{daily.title}</h3>
          <div className="daily-total">
            {hasChildren && <span>{draft.daily.children.length} 项</span>}
            <PlannedMinutes minutes={getDailyPlannedMinutes(draft.daily)} />
          </div>
        </div>
        {hasChildren ? (
          hasActual && (
            <span className="daily-actual-total">
              <span>实际 · 分钟</span>
              <strong>{total}</strong>
            </span>
          )
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
        <ul className="daily-children" aria-label={daily.title + '子任务'}>
          {draft.daily.children.map((child, index) => (
            <li
              className="daily-child-row"
              key={child.id ?? child.templateItemId ?? index}
            >
              <Checkbox
                className="daily-check"
                aria-label={'完成 ' + child.title}
                checked={child.completed}
                disabled={saving}
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
              <div className="daily-child-copy">
                <span className="daily-child-name">{child.title}</span>
                <PlannedMinutes minutes={child.plannedDurationMinutes ?? 0} />
              </div>
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
            </li>
          ))}
        </ul>
      )}
      {hasChildren && daily.actual > 0 && (
        <p className="daily-legacy-minutes">
          原有额外耗时 {daily.actual} 分钟，已计入合计
        </p>
      )}
      <span className="daily-save-status" role="status">
        {saving ? '正在保存…' : ''}
      </span>
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
