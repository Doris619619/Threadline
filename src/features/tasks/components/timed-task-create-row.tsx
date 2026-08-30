/** @fileoverview 渲染今日日程新增行，使用跨页面草稿控制器而不自行持久化状态。 */

'use client';

import { Check, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { TimedTaskCreateDraft } from '@/features/tasks/hooks/use-task-create-drafts';
import type { TimedTaskDraft } from '@/features/tasks/task-drafts';
import type { Project } from '@/types/domain';

/** 保持日程新增行 DOM、键盘和空标题取消契约；成功创建前始终保留草稿。 */
export function TimedTaskCreateRow({
  open,
  draft,
  projects,
  onCreate,
  onCreateProject,
  onChange,
  onReset,
  onClose,
}: {
  open: boolean;
  draft: TimedTaskCreateDraft;
  projects: Project[];
  onCreate: (
    draft: TimedTaskDraft,
  ) =>
    | { cancelled: boolean; error?: undefined; task?: undefined }
    | { error: string; cancelled?: undefined; task?: undefined }
    | { task: unknown; cancelled?: undefined; error?: undefined };
  onCreateProject: (name: string) => Project;
  onChange: (patch: Partial<TimedTaskCreateDraft>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  /** 创建项目后只更新当前日程草稿的项目选择。 */
  const addProject = () => {
    if (!draft.projectName.trim()) return;
    const created = onCreateProject(draft.projectName.trim());
    onChange({ projectId: created.id, projectName: '', isAddingProject: false });
  };
  /** 委托动作层验证；输入错误保留行，取消保留字段，成功后才重置。 */
  const confirm = () => {
    const result = onCreate({
      actual: draft.actual,
      completed: draft.completed,
      endTime: draft.endTime,
      planned: draft.planned,
      projectId: draft.projectId,
      startTime: draft.startTime,
      title: draft.title,
    });
    if ('error' in result) return onChange({ timeError: result.error });
    if ('cancelled' in result) return onClose();
    onReset();
    onClose();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') confirm();
    if (event.key === 'Escape') onClose();
  };
  if (!open) return null;
  return (
    <div className="timeline-row timeline-row-adding">
      <div className="task-check-wrap">
        <Checkbox
          checked={draft.completed}
          onChange={(event) => onChange({ completed: event.target.checked })}
        />
      </div>
      <input
        className="tl-inline-input task-title-input task-title"
        placeholder="任务名称（按 Enter 保存）"
        value={draft.title}
        onChange={(event) => onChange({ title: event.target.value })}
        onKeyDown={onKeyDown}
      />
      <div className="timeline-meta">
        <div className="timeline-time-range-inputs">
          <input
            className="tl-inline-input timeline-time-input"
            aria-label="开始时间"
            placeholder="08:30"
            value={draft.startTime}
            autoFocus
            onChange={(event) =>
              onChange({ startTime: event.target.value, timeError: undefined })
            }
            onKeyDown={onKeyDown}
          />
          <span aria-hidden="true">→</span>
          <input
            className="tl-inline-input timeline-time-input"
            aria-label="结束时间"
            placeholder="10:00"
            value={draft.endTime}
            onChange={(event) =>
              onChange({ endTime: event.target.value, timeError: undefined })
            }
            onKeyDown={onKeyDown}
          />
          {draft.timeError && (
            <span className="timeline-inline-error">{draft.timeError}</span>
          )}
        </div>
        <div className="task-project-cell" style={{ position: 'relative' }}>
          <select
            className="tl-inline-select project-inline-select"
            value={draft.projectId}
            onChange={(event) =>
              event.target.value === '__new__'
                ? onChange({ isAddingProject: true })
                : onChange({ projectId: event.target.value })
            }
          >
            {projects
              .filter((project) => project.status === 'active')
              .map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            <option value="__new__">+ 新增项目…</option>
          </select>
          {draft.isAddingProject && (
            <div className="project-picker-popover">
              <div className="project-picker-new-form">
                <input
                  placeholder="新项目名称"
                  value={draft.projectName}
                  autoFocus
                  onChange={(event) => onChange({ projectName: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addProject();
                    }
                    if (event.key === 'Escape') onChange({ isAddingProject: false });
                  }}
                />
                <button
                  type="button"
                  className="tl-inline-confirm-btn"
                  onClick={addProject}
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  className="tl-inline-cancel-btn"
                  onClick={() => onChange({ isAddingProject: false })}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
        <input
          className="tl-inline-input task-duration-input task-duration task-duration-planned"
          placeholder="45min"
          value={draft.planned}
          onChange={(event) => onChange({ planned: event.target.value })}
          onKeyDown={onKeyDown}
        />
        <input
          className="tl-inline-input task-duration-input task-duration task-duration-actual"
          placeholder="实际耗时"
          value={draft.actual}
          onChange={(event) => onChange({ actual: event.target.value })}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="tl-inline-actions-cell">
        <button
          type="button"
          className="tl-inline-confirm-btn"
          onClick={confirm}
          title="保存任务"
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          className="tl-inline-cancel-btn"
          onClick={onClose}
          title="取消"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
