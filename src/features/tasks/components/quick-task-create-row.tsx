/**
 * @fileoverview 渲染无时间待办的新增行；草稿独立于日程行且在取消后保留。
 */

'use client';

import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import type { QuickTaskDraft } from '@/features/tasks/task-drafts';
import type { Project } from '@/types/domain';

/** 保持无时间待办的项目选择、Enter/Escape 和空标题取消行为。 */
export function QuickTaskCreateRow({
  open,
  projects,
  defaultProjectId,
  onCreate,
  onCreateProject,
  onClose,
}: {
  open: boolean;
  projects: Project[];
  defaultProjectId: string;
  onCreate: (draft: QuickTaskDraft) =>
    | { cancelled: boolean; task?: undefined }
    | { task: unknown; cancelled?: undefined };
  onCreateProject: (name: string) => Project;
  onClose: () => void;
}) {
  const [completed, setCompleted] = useState(false);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [title, setTitle] = useState('');
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) setProjectId(defaultProjectId);
    wasOpen.current = open;
  }, [defaultProjectId, open]);

  const addProject = () => {
    if (!projectName.trim()) return;
    const created = onCreateProject(projectName.trim());
    setProjectId(created.id);
    setProjectName('');
    setIsAddingProject(false);
  };

  const confirm = () => {
    const result = onCreate({ completed, projectId, title });
    if ('cancelled' in result) {
      onClose();
      return;
    }
    setTitle('');
    setCompleted(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="quick-task-row quick-task-row-adding">
      <div className="task-check-wrap">
        <Checkbox checked={completed} onChange={(event) => setCompleted(event.target.checked)} />
      </div>
      <div style={{ position: 'relative' }}>
        <select
          className="tl-inline-select project-inline-select"
          value={projectId}
          onChange={(event) => {
            if (event.target.value === '__new__') setIsAddingProject(true);
            else setProjectId(event.target.value);
          }}
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
        {isAddingProject && (
          <div className="project-picker-popover">
            <div className="project-picker-new-form">
              <input
                placeholder="新项目名称"
                value={projectName}
                autoFocus
                onChange={(event) => setProjectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addProject();
                  }
                  if (event.key === 'Escape') setIsAddingProject(false);
                }}
              />
              <button type="button" className="tl-inline-confirm-btn" onClick={addProject}>
                <Check size={13} />
              </button>
              <button
                type="button"
                className="tl-inline-cancel-btn"
                onClick={() => setIsAddingProject(false)}
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
        value={title}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') confirm();
          if (event.key === 'Escape') onClose();
        }}
      />
      <div className="tl-inline-actions-cell">
        <button type="button" className="tl-inline-confirm-btn" onClick={confirm} title="保存待办">
          <Check size={14} />
        </button>
        <button type="button" className="tl-inline-cancel-btn" onClick={onClose} title="取消">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
