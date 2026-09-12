/**
 * @fileoverview 渲染任务编辑、移期与每日收尾对话框，保持既有 FormData 和可访问性契约。
 */
'use client';

import { ManagementDialog } from '@/components/ui/management-dialog';
import { getLocalDateKey } from '@/lib/local-date';
import { PlannedMinutesField } from './planned-minutes-field';

import { useId, useRef, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatMinutes } from '@/features/tasks/task-time';
import { resolveActiveProject } from '@/lib/project-rules';
import type { Project, Task } from '@/types/domain';

/** 仅选择指定日期时展示日期控件，避免窄屏上的原生日期输入撑开表单。 */
function CloseTaskRow({ task, tomorrow }: { task: Task; tomorrow: string }) {
  const [action, setAction] = useState('tomorrow');
  return (
    <div className="close-task">
      <label>
        <span>{task.title}</span>
        <span className="close-select-field">
          <select
            aria-label={task.title + '处理方式'}
            name={'action-' + task.id}
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="tomorrow">移到明天</option>
            <option value="date">指定日期</option>
            <option value="waiting">放回待安排</option>
            <option value="abandoned">放弃</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </label>
      {action === 'date' && (
        <label className="close-target-date">
          目标日期
          <Input
            aria-label={task.title + '目标日期'}
            name={'date-' + task.id}
            type="date"
            defaultValue={tomorrow}
            required
          />
        </label>
      )}
    </div>
  );
}

/** 收尾对话框固定居中并独立滚动，确认成功后才关闭；取消始终不提交表单。 */
export function CloseDialog({
  dialog,
  tasks,
  actual,
  dailyDone,
  dailyCount,
  dailyActual,
  tomorrow,
  onCloseDay,
}: {
  dialog: React.RefObject<HTMLDialogElement | null>;
  tasks: Task[];
  actual: number;
  dailyDone: number;
  dailyCount: number;
  dailyActual: number;
  tomorrow: string;
  onCloseDay: (data: FormData) => Promise<void>;
}) {
  const unfinished = tasks.filter((task) => !task.completed);
  const titleId = useId();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  return (
    <dialog
      className="task-dialog close-dialog"
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (saving) event.preventDefault();
      }}
    >
      <form
        className="task-editor-form"
        action={async (data) => {
          if (savingRef.current) return;
          savingRef.current = true;
          setSaving(true);
          setError(undefined);
          try {
            await onCloseDay(data);
            dialog.current?.close();
          } catch (submitError) {
            setError(
              submitError instanceof Error
                ? submitError.message
                : '收尾保存失败，请重试。',
            );
          } finally {
            savingRef.current = false;
            setSaving(false);
          }
        }}
      >
        <header>
          <div>
            <p>每日收尾</p>
            <h2 id={titleId}>结束今天</h2>
          </div>
          <button
            type="button"
            aria-label="关闭"
            disabled={saving}
            onClick={() => dialog.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="close-content">
          <div className="close-summary">
            <span>今日实际投入</span>
            <strong>{formatMinutes(actual + dailyActual)}</strong>
            <p>
              任务 {formatMinutes(actual)} · Daily {formatMinutes(dailyActual)}
            </p>
            <div className="close-metrics">
              <span>
                任务完成{' '}
                <b>
                  {tasks.filter((task) => task.completed).length} / {tasks.length}
                </b>
              </span>
              <span>
                Daily 完成{' '}
                <b>
                  {dailyDone} / {dailyCount}
                </b>
              </span>
            </div>
          </div>
          <section className="close-unfinished" aria-label="未完成任务安排">
            <h3>
              未完成任务 <span>{unfinished.length}</span>
            </h3>
            {unfinished.length === 0 ? (
              <p>今天的任务都完成了。</p>
            ) : (
              unfinished.map((task) => (
                <CloseTaskRow key={task.id} task={task} tomorrow={tomorrow} />
              ))
            )}
          </section>
          <p className="close-note">未完成的 Daily 留在今天，不会顺延。</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button
            type="button"
            disabled={saving}
            onClick={() => dialog.current?.close()}
          >
            稍后处理
          </button>
          <button type="submit" disabled={saving}>
            {saving ? '保存中…' : '确认结束今天'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/** 等待改期提交，保留失败输入，并支持今天起的任意日期。 */
export function RescheduleDialog({
  task,
  defaultDate,
  onSave,
  onClose,
}: {
  task?: Task;
  defaultDate: string;
  onSave: (date: string) => string | undefined | Promise<string | undefined>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  if (!task) return null;
  return (
    <ManagementDialog
      busy={saving}
      title="改期任务"
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (savingRef.current) return;
          savingRef.current = true;
          const date = String(new FormData(event.currentTarget).get('date') ?? '');
          setSaving(true);
          try {
            setError(await onSave(date));
          } catch (error) {
            setError(error instanceof Error ? error.message : '改期失败，请重试。');
          } finally {
            savingRef.current = false;
            setSaving(false);
          }
        }}
      >
        <p>{task.title}</p>
        <label>
          新日期
          <Input
            data-management-initial-focus
            aria-label="移期日期"
            name="date"
            type="date"
            min={getLocalDateKey()}
            defaultValue={
              defaultDate < getLocalDateKey() ? getLocalDateKey() : defaultDate
            }
            required
          />
        </label>
        <p>可提前或推后到今天及未来日期，原日期历史与实际投入保留。</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button type="submit" disabled={saving}>
            {saving ? '保存中…' : '确认改期'}
          </button>
        </footer>
      </form>
    </ManagementDialog>
  );
}

/** 复用任务字段表单并限制重复提交；持久化失败时保留输入与焦点。 */
export function TaskDialog({
  open,
  mode = 'normal',
  editing,
  projects,
  onSave,
  onClose,
  initialFocus = 'title',
  inWorkstation = false,
  onToggleWorkstation,
}: {
  open: boolean;
  mode?: 'normal' | 'waiting';
  editing?: Task;
  projects: Project[];
  onSave: (data: FormData) => Promise<string | undefined>;
  onClose: () => void;
  /** 规划的“定时间”入口直接聚焦开始时间；待安排表单始终聚焦标题。 */
  initialFocus?: 'title' | 'start';
  inWorkstation?: boolean;
  onToggleWorkstation?: (id: string) => void;
}) {
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  if (!open) return null;
  const isWaiting = mode === 'waiting';
  const defaultProjectId =
    editing?.projectId ?? resolveActiveProject(projects)?.id ?? '';

  return (
    <ManagementDialog
      busy={saving}
      title={
        isWaiting
          ? editing
            ? '修改待安排事项'
            : '添加待安排事项'
          : editing
            ? '编辑任务'
            : '添加任务'
      }
      onClose={() => {
        if (!saving) onClose();
      }}
      initialFocusSelector={`input[name="${isWaiting ? 'title' : initialFocus}"]`}
    >
      <form
        className="task-editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (savingRef.current) return;
          savingRef.current = true;
          setSaving(true);
          try {
            setError(await onSave(data));
          } catch (error) {
            setError(error instanceof Error ? error.message : '保存失败，请重试。');
          } finally {
            savingRef.current = false;
            setSaving(false);
          }
        }}
      >
        <label>
          任务名称
          <Input
            name="title"
            defaultValue={editing?.title}
            placeholder="准备要做的事情"
            required
          />
        </label>

        {isWaiting ? (
          <div className="task-form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <label>
              项目
              <select name="project" defaultValue={defaultProjectId}>
                {projects
                  .filter(
                    (project) =>
                      project.status === 'active' || project.id === editing?.projectId,
                  )
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              重要性
              <select name="importance" defaultValue={editing?.importance ?? 'normal'}>
                <option value="normal">普通</option>
                <option value="important">重要</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="task-form-grid">
            <label className="task-form-project">
              项目
              <select name="project" defaultValue={defaultProjectId}>
                {projects
                  .filter(
                    (project) =>
                      project.status === 'active' || project.id === editing?.projectId,
                  )
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              开始时间
              <Input
                name="start"
                defaultValue={editing?.plannedStartTime}
                placeholder="1420 或 14:20"
              />
            </label>
            <label>
              结束时间
              <Input
                name="end"
                defaultValue={editing?.plannedEndTime}
                placeholder="可选"
              />
            </label>
          </div>
        )}

        <div className="task-form-grid task-form-durations">
          <PlannedMinutesField defaultValue={editing?.plannedDurationMinutes} />
          {!isWaiting && (
            <label>
              实际时长（分钟）
              <Input
                name="actual"
                type="number"
                defaultValue={editing?.actualDurationMinutes}
              />
            </label>
          )}
        </div>

        {editing && onToggleWorkstation && (
          <button
            type="button"
            className="task-workstation-detail"
            aria-pressed={inWorkstation}
            onClick={() => onToggleWorkstation(editing.id)}
          >
            {inWorkstation ? '从工作站移除' : '加入工作站'}
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button type="submit" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </footer>
      </form>
    </ManagementDialog>
  );
}
