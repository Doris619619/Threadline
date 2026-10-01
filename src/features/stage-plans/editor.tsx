/** @fileoverview 阶段短表单与连续清单草稿；固定打开时版本、稳定 ID、失败保留与中文 Enter 保护。 */
'use client';
import { useState, useRef, useEffect } from 'react';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { Button } from '@/components/ui/button';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import { useAccountToday } from '@/features/settings/account-timezone-provider';
import { addLocalDateDays } from '@/lib/local-date';
import type { StagePlan, Project } from '@/types/domain';
import { resolveActiveProject } from '@/lib/project-rules';
import { useStagePlans } from './state';
import { validateStageDraft, type StageTaskDraft } from './rules';
import { StageDraftList } from './draft-list';
import { useStageEditorViewport } from './editor-viewport';

/** 新建阶段可以零项清单；未按 Enter 的最后一项也随确认提交。 */
export function StageEditor({
  plan,
  onClose,
  onSaved,
  projects = [],
}: {
  plan?: StagePlan;
  onClose: () => void;
  onSaved?: (plan: StagePlan) => void;
  projects?: Project[];
}) {
  const today = useAccountToday();
  const stages = useStagePlans();
  const { mobile, backdropStyle } = useStageEditorViewport();
  const [step, setStep] = useState<'details' | 'tasks'>('details');
  // 草稿基准固定为打开弹窗时的版本，实时刷新不能给旧输入换成新版并发令牌。
  const [openingPlan] = useState(plan);
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
  const form = useRef<HTMLFormElement>(null);
  const { busy, error, setError, run } = useGuardedAction();
  /** 手机步骤切换只移动输入焦点，不重新初始化草稿；已有阶段保持原编辑焦点规则。 */
  useEffect(() => {
    if (!mobile || plan) return;
    const target =
      step === 'tasks'
        ? input.current
        : form.current?.querySelector<HTMLInputElement>(
            '[data-management-initial-focus]',
          );
    target?.focus();
  }, [mobile, plan, step]);
  /** 手机先确认名称和日期，再进入选填清单；前后切换不丢草稿或生成新的 ID。 */
  const next = () => {
    const message = validateStageDraft({ name, startDate, endDate });
    setError(message);
    if (!message) setStep('tasks');
  };
  /** Enter 只收集有效项，保持输入焦点；真正写入发生在阶段确认时。 */
  const add = () => {
    if (!pending.title.trim()) return;
    if (pending.title.trim().length > 200) {
      setError('任务名称不能超过 200 个字符。');
      return;
    }
    setItems((rows) => [
      ...rows,
      {
        ...pending,
        title: pending.title.trim(),
        projectId: pending.projectId ?? resolveActiveProject(projects)?.id,
      },
    ]);
    setPending((row) => ({
      id: crypto.randomUUID(),
      title: '',
      projectId: row.projectId,
    }));
    input.current?.focus();
  };
  /** 已添加草稿只修改自己的项目；保留任务 ID、标题以及下一条任务的项目选择。 */
  const changeItemProject = (itemId: string, projectId: string) =>
    setItems((rows) =>
      rows.map((row) => (row.id === itemId ? { ...row, projectId } : row)),
    );
  /** 验证名称日期后提交事务；网络失败保留每一个清单 ID 和输入。 */
  const submit = () =>
    void run(async () => {
      const draft = {
        id,
        name,
        startDate,
        endDate,
        homeVisible,
        tasks: (pending.title.trim()
          ? [...items, { ...pending, title: pending.title.trim() }]
          : items
        ).map((item) => ({
          ...item,
          title: item.title.trim(),
          projectId: item.projectId ?? resolveActiveProject(projects)?.id,
        })),
      };
      const message = validateStageDraft(draft);
      if (message) throw new Error(message);
      if (draft.tasks.some((item) => !item.title || item.title.length > 200))
        throw new Error('每项任务需要 1–200 个字符，请填写或移除空白项。');
      const saved = openingPlan
        ? await stages.update(openingPlan, {
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
      className="stage-editor-dialog"
      backdropStyle={backdropStyle}
    >
      <form
        className="stage-editor"
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          if (mobile && !plan && step === 'details') next();
          else submit();
        }}
      >
        {(!mobile || plan || step === 'details') && (
          <div className="stage-editor-fields">
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
          </div>
        )}
        {mobile && !plan && step === 'tasks' && (
          <p className="stage-mobile-summary">{name}</p>
        )}
        {!plan && (!mobile || step === 'tasks') && (
          <StageDraftList
            items={items}
            pending={pending.title}
            projects={projects}
            projectId={pending.projectId ?? resolveActiveProject(projects)?.id}
            onProjectChange={(projectId) =>
              setPending((row) => ({ ...row, projectId }))
            }
            onItemProjectChange={changeItemProject}
            inputRef={input}
            onPendingChange={(title) => setPending((row) => ({ ...row, title }))}
            onChange={(itemId, title) =>
              setItems((rows) =>
                rows.map((row) => (row.id === itemId ? { ...row, title } : row)),
              )
            }
            onRemove={(itemId) => {
              setItems((rows) => rows.filter((row) => row.id !== itemId));
              input.current?.focus();
            }}
            onAdd={add}
          />
        )}
        <footer>
          {(!mobile || plan || step === 'details') && (
            <label className="stage-visible-field">
              <input
                type="checkbox"
                checked={homeVisible}
                onChange={(event) => setVisible(event.target.checked)}
              />
              <span className="stage-visible-check" aria-hidden="true">
                ✓
              </span>
              <span>显示在首页</span>
            </label>
          )}
          <div className="stage-editor-actions">
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              onClick={
                mobile && !plan && step === 'tasks' ? () => setStep('details') : onClose
              }
            >
              {mobile && !plan && step === 'tasks' ? '上一步' : '取消'}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {plan ? '保存' : mobile && step === 'details' ? '下一步' : '创建阶段'}
            </Button>
          </div>
        </footer>
      </form>
    </ManagementDialog>
  );
}

/** 阶段详情内快速追加真实 Task；成功后重置 ID，失败保留输入供重试。 */
export function StageAddTask({
  stageId,
  projects,
}: {
  stageId: string;
  projects: Project[];
}) {
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
      await stages.append(stageId, {
        ...draft,
        title: draft.title.trim(),
        projectId: draft.projectId ?? resolveActiveProject(projects)?.id,
      });
      setDraft((row) => ({
        id: crypto.randomUUID(),
        title: '',
        projectId: row.projectId,
      }));
      input.current?.focus();
    });
  };
  return (
    <div className="stage-add-task">
      <form
        className="stage-quick-input stage-quick-input--project"
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
        <select
          aria-label="阶段任务项目"
          disabled={busy}
          value={draft.projectId ?? resolveActiveProject(projects)?.id ?? ''}
          onChange={(event) =>
            setDraft((row) => ({ ...row, projectId: event.target.value }))
          }
        >
          {projects
            .filter((project) => project.status === 'active')
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
        </select>
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
