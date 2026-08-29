/**
 * @fileoverview 渲染今日日程的新增行；草稿留在行内以保留取消后再次打开的既有输入内容。
 */

'use client';

import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import type { TimedTaskDraft } from '@/features/tasks/task-drafts';
import type { Project } from '@/types/domain';

/** 保持日程新增行的 DOM、键盘和空标题取消契约，成功提交后才重置草稿。 */
export function TimedTaskCreateRow({
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
  onCreate: (draft: TimedTaskDraft) =>
    | { cancelled: boolean; error?: undefined; task?: undefined }
    | { error: string; cancelled?: undefined; task?: undefined }
    | { task: unknown; cancelled?: undefined; error?: undefined };
  onCreateProject: (name: string) => Project;
  onClose: () => void;
}) {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timeError, setTimeError] = useState<string>();
  const [completed, setCompleted] = useState(false);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [title, setTitle] = useState('');
  const [planned, setPlanned] = useState('');
  const [actual, setActual] = useState('');
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
    const result = onCreate({
      actual,
      completed,
      endTime,
      planned,
      projectId,
      startTime,
      title,
    });
    if ('error' in result) {
      setTimeError(result.error);
      return;
    }
    if ('cancelled' in result) {
      onClose();
      return;
    }
    setTimeError(undefined);
    setStartTime('');
    setEndTime('');
    setTitle('');
    setPlanned('');
    setActual('');
    setCompleted(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="timeline-row timeline-row-adding">
      <div className="timeline-time-range-inputs">
        <input
          className="tl-inline-input timeline-time-input"
          aria-label="开始时间"
          placeholder="08:30"
          value={startTime}
          autoFocus
          onChange={(event) => {
            setStartTime(event.target.value);
            setTimeError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') confirm();
            if (event.key === 'Escape') onClose();
          }}
        />
        <span aria-hidden="true">→</span>
        <input
          className="tl-inline-input timeline-time-input"
          aria-label="结束时间"
          placeholder="10:00"
          value={endTime}
          onChange={(event) => {
            setEndTime(event.target.value);
            setTimeError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') confirm();
            if (event.key === 'Escape') onClose();
          }}
        />
        {timeError && <span className="timeline-inline-error">{timeError}</span>}
      </div>
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
        placeholder="任务名称（按 Enter 保存）"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') confirm();
          if (event.key === 'Escape') onClose();
        }}
      />
      <input
        className="tl-inline-input task-duration-input"
        placeholder="45min"
        value={planned}
        onChange={(event) => setPlanned(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') confirm();
          if (event.key === 'Escape') onClose();
        }}
      />
      <input
        className="tl-inline-input task-duration-input"
        placeholder="实际耗时"
        value={actual}
        onChange={(event) => setActual(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') confirm();
          if (event.key === 'Escape') onClose();
        }}
      />
      <div className="tl-inline-actions-cell">
        <button type="button" className="tl-inline-confirm-btn" onClick={confirm} title="保存任务">
          <Check size={14} />
        </button>
        <button type="button" className="tl-inline-cancel-btn" onClick={onClose} title="取消">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
