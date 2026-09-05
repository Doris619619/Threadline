/**
 * @fileoverview 渲染任务编辑、移期与每日收尾对话框，保持既有 FormData 和可访问性契约。
 */
'use client';

import { useId, useState } from 'react';
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
        action={async (data) => {
          if (saving) return;
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

export function RescheduleDialog({
  task,
  defaultDate,
  onSave,
  onClose,
}: {
  task?: Task;
  defaultDate: string;
  onSave: (date: string) => string | undefined;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  if (!task) return null;
  return (
    <div className="task-dialog-backdrop" role="presentation">
      <form
        className="task-dialog reschedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="移期任务"
        onSubmit={(event) => {
          event.preventDefault();
          const date = String(new FormData(event.currentTarget).get('date') ?? '');
          const message = onSave(date);
          setError(message);
        }}
      >
        <header>
          <div>
            <h2>移期</h2>
            <p>{task.title}</p>
          </div>
          <button type="button" aria-label="关闭移期" onClick={onClose}>
            ×
          </button>
        </header>
        <label>
          新日期
          <Input
            aria-label="移期日期"
            name="date"
            type="date"
            defaultValue={defaultDate}
          />
        </label>
        <p className="dialog-hint">
          默认明天；也可选择任意未来日期。原日期历史会保留。
        </p>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit">确认移期</button>
        </footer>
      </form>
    </div>
  );
}

export function TaskDialog({
  open,
  mode = 'normal',
  editing,
  projects,
  onSave,
  onClose,
}: {
  open: boolean;
  mode?: 'normal' | 'waiting';
  editing?: Task;
  projects: Project[];
  onSave: (data: FormData) => Promise<string | undefined>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  if (!open) return null;
  const isWaiting = mode === 'waiting';
  const defaultProjectId =
    editing?.projectId ?? resolveActiveProject(projects)?.id ?? '';

  return (
    <div className="task-dialog-backdrop" role="presentation">
      <section
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={
          editing
            ? isWaiting
              ? '修改待安排事项'
              : '编辑任务'
            : isWaiting
              ? '添加待安排事项'
              : '添加任务'
        }
      >
        <form
          action={async (data) => {
            const message = await onSave(data);
            setError(message);
          }}
        >
          <header>
            <div>
              <p>
                {editing
                  ? isWaiting
                    ? '编辑待安排事项'
                    : '编辑任务'
                  : isWaiting
                    ? '待安排'
                    : '快速新建'}
              </p>
              <h2>
                {editing
                  ? isWaiting
                    ? '修改待办事项'
                    : '修改任务'
                  : isWaiting
                    ? '添加待安排事项'
                    : '添加任务'}
              </h2>
            </div>
            <button type="button" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </header>
          <label>
            任务名称
            <Input
              name="title"
              defaultValue={editing?.title}
              placeholder="准备要做的事情"
              required
              autoFocus
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
                        project.status === 'active' ||
                        project.id === editing?.projectId,
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
                <select
                  name="importance"
                  defaultValue={editing?.importance ?? 'normal'}
                >
                  <option value="normal">普通</option>
                  <option value="important">重要</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="task-form-grid">
              <label>
                项目
                <select name="project" defaultValue={defaultProjectId}>
                  {projects
                    .filter(
                      (project) =>
                        project.status === 'active' ||
                        project.id === editing?.projectId,
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
              <label>
                预计时长（分钟）
                <Input
                  name="planned"
                  type="number"
                  defaultValue={editing?.plannedDurationMinutes}
                />
              </label>
              <label>
                实际时长（分钟）
                <Input
                  name="actual"
                  type="number"
                  defaultValue={editing?.actualDurationMinutes}
                />
              </label>
            </div>
          )}

          {!isWaiting && <p>开始和结束同时填写时自动计算预计时长；不支持跨午夜。</p>}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button type="submit">保存</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
