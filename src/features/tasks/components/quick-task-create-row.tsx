/** @fileoverview 渲染无时间待办新增行，使用跨页面草稿控制器而不自行持久化状态。 */

'use client';

import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import type { QuickTaskCreateDraft } from '@/features/tasks/hooks/use-task-create-drafts';
import type { QuickTaskDraft } from '@/features/tasks/task-drafts';
import type { Project } from '@/types/domain';

/** 保持无时间待办的项目选择、Enter/Escape 和空标题取消行为。 */
export function QuickTaskCreateRow({
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
    { cancelled: boolean; task?: undefined } | { task: unknown; cancelled?: undefined }
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
  /** 空标题沿用动作层的取消结果；只有真实创建成功才清空草稿。 */
  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await onCreate({
      completed: draft.completed,
      projectId: draft.projectId,
      title: draft.title,
      });
      if ('cancelled' in result) return onClose();
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
    <div className="quick-task-row quick-task-row-adding">
      <div className="task-check-wrap">
        <Checkbox
          checked={draft.completed}
          onChange={(event) => onChange({ completed: event.target.checked })}
        />
      </div>
      <div style={{ position: 'relative' }}>
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
        className="tl-inline-input task-title-input"
        placeholder="待办内容（按 Enter 保存）"
        value={draft.title}
        autoFocus
        onChange={(event) => onChange({ title: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') confirm();
          if (event.key === 'Escape') onClose();
        }}
      />
      <div className="tl-inline-actions-cell">
        <button
          type="button"
          className="tl-inline-confirm-btn"
          onClick={confirm}
          title="保存待办"
          disabled={saving}
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
      {saveError && <span className="timeline-inline-error" role="alert">{saveError}</span>}
    </div>
  );
}
