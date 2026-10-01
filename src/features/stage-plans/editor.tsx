/** @fileoverview 阶段短表单与连续清单草稿，稳定 ID、失败保留和中文 Enter 保护。 */
'use client';
import { useState, useRef, useEffect } from 'react';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { Button } from '@/components/ui/button';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import { useAccountToday } from '@/features/settings/account-timezone-provider';
import { addLocalDateDays } from '@/lib/local-date';
import type { StagePlan } from '@/types/domain';
import { useStagePlans } from './state';
import { validateStageDraft, type StageTaskDraft } from './rules';

/** 新建阶段可以零项清单；未按 Enter 的最后一项也随确认提交。 */
export function StageEditor({
  plan,
  onClose,
  onSaved,
}: {
  plan?: StagePlan;
  onClose: () => void;
  onSaved?: (plan: StagePlan) => void;
}) {
  const today = useAccountToday();
  const stages = useStagePlans();
  const [id] = useState(() => plan?.id ?? crypto.randomUUID());
  const [name, setName] = useState(plan?.name ?? '');
  const [startDate, setStart] = useState(plan?.startDate ?? today);
  const [endDate, setEnd] = useState(plan?.endDate ?? addLocalDateDays(today, 7));
  const [homeVisible, setVisible] = useState(plan?.homeVisible ?? true);
  const [items, setItems] = useState<StageTaskDraft[]>([]);
  const [pending, setPending] = useState<StageTaskDraft>(() => ({
    id: crypto.randomUUID(),
    title: '',
  }));
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, setError, run } = useGuardedAction();
  /** Enter 只收集有效项，保持输入焦点；真正写入发生在阶段确认时。 */
  const add = () => {
    if (!pending.title.trim()) return;
    if (pending.title.trim().length > 200) {
      setError('任务名称不能超过 200 个字符。');
      return;
    }
    setItems((rows) => [...rows, { ...pending, title: pending.title.trim() }]);
    setPending({ id: crypto.randomUUID(), title: '' });
    input.current?.focus();
  };
  /** 验证名称日期后提交事务；网络失败保留每一个清单 ID 和输入。 */
  const submit = () =>
    void run(async () => {
      const draft = {
        id,
        name,
        startDate,
        endDate,
        homeVisible,
        tasks: pending.title.trim()
          ? [...items, { ...pending, title: pending.title.trim() }]
          : items,
      };
      const message = validateStageDraft(draft);
      if (message) throw new Error(message);
      const saved = plan
        ? await stages.update(plan, {
            name: name.trim(),
            startDate,
            endDate,
            homeVisible,
          })
        : await stages.create(draft);
      onSaved?.(saved);
      onClose();
    });
  return (
    <ManagementDialog
      title={plan ? '编辑阶段' : '新建阶段'}
      onClose={onClose}
      busy={busy}
      error={error}
    >
      <form
        className="stage-editor"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <fieldset disabled={busy}>
          <label>
            阶段名称
            <input
              data-management-initial-focus
              aria-label="阶段名称"
              value={name}
              maxLength={80}
              required
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：国庆假期"
            />
          </label>
          <div className="stage-date-fields">
            <label>
              开始日期
              <input
                aria-label="阶段开始日期"
                type="date"
                required
                value={startDate}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              结束日期
              <input
                aria-label="阶段结束日期"
                type="date"
                required
                value={endDate}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </div>
          <label className="stage-visible-field">
            <input
              type="checkbox"
              checked={homeVisible}
              onChange={(event) => setVisible(event.target.checked)}
            />
            显示在首页
          </label>
          {!plan && (
            <div className="stage-draft-list">
              <p>先列出这段时间想完成的事，日期和几点可以以后再安排。</p>
              {items.map((item) => (
                <div className="stage-draft-item" key={item.id}>
                  <span>{item.title}</span>
                  <button
                    type="button"
                    aria-label={'移除草稿 ' + item.title}
                    onClick={() =>
                      setItems((rows) => rows.filter((row) => row.id !== item.id))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="stage-quick-input">
                <input
                  ref={input}
                  aria-label="阶段任务名称"
                  maxLength={200}
                  placeholder="输入任务，按 Enter 连续添加"
                  value={pending.title}
                  onChange={(event) =>
                    setPending((row) => ({ ...row, title: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (!event.nativeEvent.isComposing && event.keyCode !== 229)
                        add();
                    }
                  }}
                />
                <button type="button" onClick={add}>
                  添加
                </button>
              </div>
            </div>
          )}
        </fieldset>
        <footer>
          <Button type="button" variant="quiet" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={busy}>
            {plan ? '保存' : '创建阶段'}
          </Button>
        </footer>
      </form>
    </ManagementDialog>
  );
}

/** 阶段详情内快速追加真实 Task；成功后重置 ID，失败保留输入供重试。 */
export function StageAddTask({ stageId }: { stageId: string }) {
  const stages = useStagePlans();
  const [draft, setDraft] = useState<StageTaskDraft>(() => ({
    id: crypto.randomUUID(),
    title: '',
  }));
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useGuardedAction();
  const submitted = useRef(false);
  /** 写入完成后恢复输入焦点，连续新增无需再次点击。 */
  useEffect(() => {
    if (!busy && submitted.current) input.current?.focus();
  }, [busy]);
  /** 一次只提交一项，空 Enter 不创建；确认后继续输入下一项。 */
  const submit = () => {
    if (!draft.title.trim()) return;
    submitted.current = true;
    void run(async () => {
      await stages.append(stageId, { ...draft, title: draft.title.trim() });
      setDraft({ id: crypto.randomUUID(), title: '' });
      input.current?.focus();
    });
  };
  return (
    <div className="stage-add-task">
      <form
        className="stage-quick-input"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={input}
          aria-label="添加阶段任务"
          maxLength={200}
          value={draft.title}
          disabled={busy}
          placeholder="添加任务，Enter 继续下一项"
          onChange={(event) =>
            setDraft((row) => ({ ...row, title: event.target.value }))
          }
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (event.nativeEvent.isComposing || event.keyCode === 229)
            )
              event.preventDefault();
          }}
        />
        <button type="submit" disabled={busy || !draft.title.trim()}>
          + 添加任务
        </button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
