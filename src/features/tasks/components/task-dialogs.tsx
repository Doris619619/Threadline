/**
 * @fileoverview 渲染任务编辑、移期与每日收尾对话框，保持既有 FormData 和可访问性契约。
 */

'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatMinutes } from '@/features/tasks/task-time';
import { resolveActiveProject } from '@/lib/project-rules';
import type { Project, Task } from '@/types/domain';
/** 渲染每日收尾表单，并在原子命令成功前保留对话框与可见错误。 */
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
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  return (
    <dialog className="task-dialog close-dialog" ref={dialog}>
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
              submitError instanceof Error ? submitError.message : '收尾保存失败，请重试。',
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <header>
          <div>
            <p>每日收尾</p>
            <h2>结束今天</h2>
          </div>
          <button formMethod="dialog" aria-label="关闭">
            ×
          </button>
        </header>
        <div className="close-metrics">
          <span>
            普通任务{' '}
            <b>
              {tasks.filter((task) => task.completed).length}/{tasks.length}
            </b>
          </span>
          <span>
            Daily{' '}
            <b>
              {dailyDone}/{dailyCount}
            </b>
          </span>
          <span>
            普通实际 <b>{formatMinutes(actual)}</b>
          </span>
          <span>
            Daily 实际 <b>{formatMinutes(dailyActual)}</b>
          </span>
          <span>
            今日总实际 <b>{formatMinutes(actual + dailyActual)}</b>
          </span>
        </div>
        <h3>未完成普通任务</h3>
        {unfinished.length === 0 ? (
          <p>所有普通任务均已完成。</p>
        ) : (
          unfinished.map((task) => (
            <div className="close-task" key={task.id}>
              <b>{task.title}</b>
              <select name={`action-${task.id}`} defaultValue="tomorrow">
                <option value="tomorrow">移到明天</option>
                <option value="date">选择日期</option>
                <option value="backlog">待安排</option>
                <option value="abandoned">放弃</option>
              </select>
              <Input name={`date-${task.id}`} type="date" defaultValue={tomorrow} />
            </div>
          ))
        )}
        <p>未完成 Daily 只记录为今日未完成，不会顺延。</p>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button formMethod="dialog">稍后处理</button>
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
  mode?: 'normal' | 'unscheduled';
  editing?: Task;
  projects: Project[];
  onSave: (data: FormData) => Promise<string | undefined>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  if (!open) return null;
  const isUnscheduled = mode === 'unscheduled' && !editing?.plannedStartTime;
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
            ? isUnscheduled
              ? '修改无时间待办'
              : '编辑任务'
            : isUnscheduled
              ? '添加无时间待办'
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
                  ? isUnscheduled
                    ? '编辑无时间待办'
                    : '编辑任务'
                  : isUnscheduled
                    ? '无时间待办'
                    : '快速新建'}
              </p>
              <h2>
                {editing
                  ? isUnscheduled
                    ? '修改待办事项'
                    : '修改任务'
                  : isUnscheduled
                    ? '添加无时间待办'
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

          {isUnscheduled ? (
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

          {!isUnscheduled && (
            <p>开始和结束同时填写时自动计算预计时长；不支持跨午夜。</p>
          )}

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
