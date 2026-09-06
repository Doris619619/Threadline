/** @fileoverview 渲染待安排新增行，桌面紧凑且移动端保持 iOS 触控尺寸。 */

'use client';

import { PlannedMinutesField } from './planned-minutes-field';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { QuickTaskCreateDraft } from '@/features/tasks/hooks/use-task-create-drafts';
import type { QuickTaskDraft } from '@/features/tasks/task-drafts';
import type { Project } from '@/types/domain';

/** 保持无时间待办的项目选择、Enter/Escape 和空标题取消行为。 */
export function WaitingTaskCreateRow({
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
  draft: QuickTaskCreateDraft;
  projects: Project[];
  onCreate: (
    draft: QuickTaskDraft,
  ) => Promise<
    | { cancelled: boolean; task?: undefined }
    | { task: unknown; cancelled?: undefined }
    | { error: string }
  >;
  onCreateProject: (name: string) => Promise<Project>;
  onChange: (patch: Partial<QuickTaskCreateDraft>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  /** 创建项目后将其选入本行草稿，而不影响日程草稿。 */
  const addProject = async () => {
    if (!draft.projectName.trim()) return;
    const created = await onCreateProject(draft.projectName.trim());
    onChange({ projectId: created.id, projectName: '', isAddingProject: false });
  };
  /** 空标题沿用动作层的取消结果；待安排始终以未完成状态创建。 */
  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await onCreate({
        projectId: draft.projectId,
        importance: draft.importance,
        planned: draft.planned,
        title: draft.title,
      });
      if ('cancelled' in result) return onClose();
      if ('error' in result) throw new Error(result.error);
      onReset();
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  };
  if (!open) return null;
  return (
    <div className="quick-task-row quick-task-row-adding quick-task-create-row">
      <div className="task-check-wrap quick-create-check-cell" aria-hidden="true" />
      <div
        className="task-project-cell quick-create-project"
        style={{ position: 'relative' }}
      >
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
        className="tl-inline-input task-title-input quick-create-title"
        aria-label={draft.importance === 'important' ? '重要事项内容' : '普通事项内容'}
        placeholder="事项内容"
        value={draft.title}
        autoFocus
        onChange={(event) => onChange({ title: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') confirm();
          if (event.key === 'Escape') onClose();
        }}
      />
      <PlannedMinutesField
        value={draft.planned ?? ''}
        onChange={(planned) => onChange({ planned })}
      />
      <div className="tl-inline-actions-cell quick-create-actions">
        <button
          type="button"
          className="tl-inline-cancel-btn quick-create-cancel-btn"
          onClick={onClose}
          title="取消"
        >
          <X size={15} />
        </button>
        <button
          type="button"
          className="tl-inline-confirm-btn quick-create-confirm-btn"
          onClick={confirm}
          title="保存待办"
          disabled={saving}
        >
          <Check size={15} />
        </button>
      </div>
      {saveError && (
        <span className="timeline-inline-error" role="alert">
          {saveError}
        </span>
      )}
    </div>
  );
}
