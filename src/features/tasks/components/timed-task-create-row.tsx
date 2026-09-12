/** @fileoverview 渲染今日日程新增行，桌面保持紧凑网格，移动端切换为独立四行表单架构。 */

'use client';

import { Check, Clock, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { TaskActionsPopover } from './task-actions-popover';
import { Checkbox } from '@/components/ui/checkbox';
import type { TimedTaskCreateDraft } from '@/features/tasks/hooks/use-task-create-drafts';
import type { TimedTaskDraft } from '@/features/tasks/task-drafts';
import { PlannedMinutesField } from './planned-minutes-field';
import type { Project } from '@/types/domain';

/** 保持日程新增行 DOM、键盘和空标题取消契约；移动端提供符合 iOS 触控规范的四行表单。 */
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
  ) => Promise<
    | { cancelled: boolean; error?: undefined; task?: undefined }
    | { error: string; cancelled?: undefined; task?: undefined }
    | { task: unknown; cancelled?: undefined; error?: undefined }
  >;
  onCreateProject: (name: string) => Promise<Project>;
  onChange: (patch: Partial<TimedTaskCreateDraft>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const projectAnchor = useRef<HTMLSelectElement>(null);
  /** 创建项目后只更新当前日程草稿的项目选择。 */
  const addProject = async () => {
    if (!draft.projectName.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const created = await onCreateProject(draft.projectName.trim());
      onChange({ projectId: created.id, projectName: '', isAddingProject: false });
    } catch (error) {
      onChange({
        timeError: error instanceof Error ? error.message : '项目创建失败，请重试。',
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  /** 委托动作层验证；输入错误保留行，取消保留字段，成功后才重置。 */
  const confirm = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await onCreate({
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
      onClose();
      onReset();
    } catch (error) {
      onChange({
        timeError: error instanceof Error ? error.message : '保存失败，请重试。',
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void confirm();
    }
    if (event.key === 'Escape' && !savingRef.current) onClose();
  };
  if (!open) return null;

  return (
    <fieldset
      disabled={saving}
      aria-busy={saving}
      aria-label="新增日程"
      className="timeline-row timeline-row-adding timed-task-create-row"
    >
      <div className="timed-create-primary">
        <div className="task-check-wrap timed-create-check-cell">
          <Checkbox
            checked={draft.completed}
            onChange={(event) => onChange({ completed: event.target.checked })}
          />
        </div>
        <div
          className="task-project-cell timed-create-project-cell"
          style={{ position: 'relative' }}
        >
          <select
            ref={projectAnchor}
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
            <TaskActionsPopover
              anchor={projectAnchor}
              label="创建项目"
              align="start"
              className="project-picker-popover task-project-popover"
              onClose={() => onChange({ isAddingProject: false })}
            >
              <fieldset disabled={saving} className="project-picker-new-form">
                <input
                  placeholder="新项目名称"
                  value={draft.projectName}
                  autoFocus
                  onChange={(event) => onChange({ projectName: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      addProject();
                    }
                    if (event.key === 'Escape' && !savingRef.current)
                      onChange({ isAddingProject: false });
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
              </fieldset>
            </TaskActionsPopover>
          )}
        </div>
        <input
          className="tl-inline-input task-title-input task-title timed-create-title-input"
          placeholder="任务名称（按 Enter 保存）"
          value={draft.title}
          onChange={(event) => onChange({ title: event.target.value })}
          onKeyDown={onKeyDown}
        />
      </div>

      <div className="timed-create-time">
        <div className="timeline-time-range-inputs">
          <div className="timed-create-time-field">
            <input
              className="tl-inline-input timeline-time-input"
              aria-label="开始时间"
              placeholder="开始时间"
              value={draft.startTime}
              onChange={(event) =>
                onChange({ startTime: event.target.value, timeError: undefined })
              }
              onKeyDown={onKeyDown}
            />
            <Clock size={15} className="timed-create-field-icon" aria-hidden="true" />
          </div>
          <span className="timed-create-time-arrow" aria-hidden="true">
            →
          </span>
          <div className="timed-create-time-field">
            <input
              className="tl-inline-input timeline-time-input"
              aria-label="结束时间"
              placeholder="结束时间"
              value={draft.endTime}
              onChange={(event) =>
                onChange({ endTime: event.target.value, timeError: undefined })
              }
              onKeyDown={onKeyDown}
            />
            <Clock size={15} className="timed-create-field-icon" aria-hidden="true" />
          </div>
          {draft.timeError && (
            <span className="timeline-inline-error">{draft.timeError}</span>
          )}
        </div>
      </div>

      <div className="timed-create-duration">
        <div className="timed-create-duration-cell timed-create-planned-cell">
          <PlannedMinutesField
            value={draft.planned}
            onChange={(planned) => onChange({ planned })}
          />
        </div>

        <div className="timed-create-duration-cell timed-create-actual-cell">
          <input
            className="tl-inline-input task-duration-input task-duration task-duration-actual"
            placeholder="实际耗时（可选）"
            aria-label="实际耗时"
            value={draft.actual}
            onChange={(event) => onChange({ actual: event.target.value })}
            onKeyDown={onKeyDown}
          />
          <Clock
            size={15}
            className="timed-create-field-icon timed-create-actual-icon"
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="tl-inline-actions-cell timed-create-actions">
        <button
          type="button"
          className="tl-inline-cancel-btn timed-create-cancel-btn"
          onClick={onClose}
          title="取消"
        >
          <span className="timed-create-btn-text">取消</span>
          <X size={14} className="timed-create-btn-icon" />
        </button>
        <button
          type="button"
          className="tl-inline-confirm-btn timed-create-confirm-btn"
          onClick={confirm}
          title="保存任务"
          aria-label={saving ? '正在保存任务' : '保存任务'}
          disabled={saving}
        >
          <span className="timed-create-btn-text">{saving ? '保存中…' : '保存'}</span>
          <Check
            style={{ opacity: saving ? 0.35 : 1 }}
            size={14}
            className="timed-create-btn-icon"
          />
        </button>
      </div>
    </fieldset>
  );
}
