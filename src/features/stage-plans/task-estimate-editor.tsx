/** @fileoverview 预计时间用单一原位数字框，实际时间保留日期记账；失败保留草稿和并发基准。 */
'use client';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Task } from '@/types/domain';
import {
  formatMinutes,
  parseEstimateMinutes,
  parseDurationInput,
} from '@/features/tasks/task-time';
import { parseLocalDateKey } from '@/lib/local-date';
import { useGuardedAction } from '@/hooks/use-guarded-action';

export type SaveStageEstimate = (
  original: Task,
  minutes: number | undefined,
  date?: string,
) => Promise<unknown>;

/** 预计回车或离焦保存、Esc 取消；提交期间操作名称稳定，实时 Task 更新不得替换打开时基准。 */
export function TaskEstimateEditor({
  task,
  onSave,
  disabled = false,
  metric = 'planned',
  today = '',
  displayLabel,
  entryDate,
}: {
  task: Task;
  onSave: SaveStageEstimate;
  disabled?: boolean;
  metric?: 'planned' | 'actual';
  today?: string;
  displayLabel?: string;
  entryDate?: string;
}) {
  const [original, setOriginal] = useState<Task>();
  const [draft, setDraft] = useState('');
  const [date, setDate] = useState('');
  const actual = metric === 'actual';
  const value = actual ? task.actualDurationMinutes : task.plannedDurationMinutes;
  const inputLabel = actual ? '累计实际分钟' : '预计分钟';
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const opened = useRef(false);
  const cancelled = useRef(false);
  const { busy, error, setError, run } = useGuardedAction();
  /** 进入时选中数字，退出时将焦点还给同一任务的估时按钮。 */
  useEffect(() => {
    if (original) {
      input.current?.focus();
      input.current?.select();
    } else if (opened.current) trigger.current?.focus();
  }, [original]);
  /** 捕获打开时记录，留空仍是未估时，不自动填入零。 */
  const open = () => {
    opened.current = true;
    cancelled.current = false;
    setDraft(value === undefined ? '' : String(value));
    setDate(entryDate ?? task.date ?? today);
    setError(undefined);
    setOriginal(task);
  };
  /** 取消只丢弃本地草稿；正在写入时不允许关闭编辑器。 */
  const cancel = () => {
    if (busy) return;
    cancelled.current = true;
    setError(undefined);
    setOriginal(undefined);
  };
  /** 原始草稿先校验，命令确认成功才收起；同步锁防止连续 Enter 重复写入。 */
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!original || cancelled.current || disabled) return;
    void run(async () => {
      const minutes = actual ? parseDurationInput(draft) : parseEstimateMinutes(draft);
      if (actual) parseLocalDateKey(date);
      await onSave(original, minutes, actual ? date : undefined);
      setOriginal(undefined);
    });
  };
  /** Escape 取消，中文输入法选词 Enter 不触发表单保存。 */
  const keyboard = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    } else if (event.key === 'Enter' && event.nativeEvent.isComposing)
      event.preventDefault();
  };
  return (
    <div className="stage-estimate-editor" aria-busy={busy}>
      {!original ? (
        <button
          ref={trigger}
          type="button"
          className="stage-estimate-trigger"
          disabled={disabled}
          aria-label={'编辑 ' + task.title + inputLabel}
          onClick={open}
        >
          {displayLabel ??
            (value === undefined
              ? actual
                ? '未记录'
                : '未估时'
              : formatMinutes(value))}
        </button>
      ) : (
        <form
          className={actual ? undefined : 'is-inline'}
          onSubmit={submit}
          onKeyDown={keyboard}
        >
          {!actual ? (
            <input
              ref={input}
              inputMode="numeric"
              enterKeyHint="done"
              aria-label={task.title + inputLabel}
              aria-invalid={!!error || undefined}
              value={draft}
              disabled={busy || disabled}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => submit()}
            />
          ) : (
            <>
              <label>
                <span>{inputLabel}</span>
                <input
                  ref={input}
                  inputMode="numeric"
                  aria-label={task.title + inputLabel}
                  aria-invalid={!!error || undefined}
                  value={draft}
                  disabled={busy || disabled}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </label>
              {actual && (
                <label>
                  <span>本次调整记入日期</span>
                  <input
                    type="date"
                    aria-label={task.title + '投入日期'}
                    value={date}
                    disabled={busy || disabled}
                    onChange={(event) => setDate(event.target.value)}
                    required
                  />
                </label>
              )}
              <button type="submit" disabled={busy || disabled}>
                保存
              </button>
              <button type="button" disabled={busy || disabled} onClick={cancel}>
                取消
              </button>
            </>
          )}
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
