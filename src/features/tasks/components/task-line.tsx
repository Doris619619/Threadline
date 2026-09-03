/**
 * @fileoverview 渲染完整工作台中的单条任务，并保持行内编辑、项目选择和任务动作契约。
 */

'use client';

import { Check, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ProjectTag } from '@/components/ui/project-tag';
import { TaskRowActions } from '@/features/tasks/components/task-row-actions';
import {
  formatMinutes,
  parseDurationInput,
  parseTimeInput,
} from '@/features/tasks/task-time';
import { resolveTaskProject } from '@/lib/project-rules';
import { cn } from '@/lib/cn';
import type { Project, Task, TaskStatus } from '@/types/domain';

/**
 * 渲染日程或无时间待办的一行。桌面用七列网格（contents 展开），手机用自适应卡片（标题+紧凑元数据）。
 */
export function TaskLine({
  task,
  onUpdate,
  onEdit,
  onMove,
  onReschedule,
  projects,
  onAddProject,
  draggable = false,
  isDragging = false,
  autoFocusTime = false,
  onTimeFocused,
  interactionLocked = false,
  onDragStart,
  onDragEnd,
  onPointerDragStart,
  onPointerDragMove,
  onPointerDragEnd,
  inSchedulePanel = false,
  inWorkstation = false,
  onToggleWorkstation,
}: {
  task: Task;
  onUpdate: (t: Task) => void;
  onEdit: () => void;
  onMove: (id: string, s: TaskStatus) => void;
  onReschedule: () => void;
  projects: Project[];
  onAddProject?: (name: string) => Promise<Project | void>;
  draggable?: boolean;
  isDragging?: boolean;
  autoFocusTime?: boolean;
  onTimeFocused?: () => void;
  interactionLocked?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onPointerDragStart?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerDragMove?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerDragEnd?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  inSchedulePanel?: boolean;
  inWorkstation?: boolean;
  onToggleWorkstation?: (taskId: string) => void;
}) {
  const project = resolveTaskProject(projects, task.projectId);
  const timed = inSchedulePanel || Boolean(task.plannedStartTime);
  const canDrag = draggable && !interactionLocked;
  const canChangeWorkflow = !task.completed;
  const [editingField, setEditingField] = useState<
    'time' | 'project' | 'title' | 'planned' | 'actual' | undefined
  >();
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [timeError, setTimeError] = useState<string>();
  const projectPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocusTime) return;
    const frame = window.requestAnimationFrame(() => {
      setEditingField('time');
      onTimeFocused?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusTime, onTimeFocused]);

  useEffect(() => {
    if (editingField !== 'project') return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        projectPickerRef.current &&
        !projectPickerRef.current.contains(e.target as Node)
      ) {
        setEditingField(undefined);
        setIsAddingProject(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingField]);

  /** 根据名称创建项目并写回当前任务归属。 */
  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !onAddProject) return;
    const created = await onAddProject(newProjectName.trim());
    if (created) {
      onUpdate({
        ...task,
        projectId: created.id,
        updatedAt: new Date().toISOString(),
      });
    }
    setNewProjectName('');
    setIsAddingProject(false);
    setEditingField(undefined);
  };

  /**
   * 保存时间输入；非法值绝不写库，主动清空也保留在日程的待填时间状态。
   */
  const saveTime = (input: string) => {
    const { start, end, duration } = parseTimeInput(input);
    if (input.trim() && (!start || (input.match(/[-–~至到\s]+/) && !end))) {
      setTimeError('请输入有效时间，如 08:30 或 08:30-10:00');
      return;
    }
    if (start && end && end <= start) {
      setTimeError('结束时间需晚于开始时间');
      return;
    }
    setTimeError(undefined);
    onUpdate({
      ...task,
      plannedStartTime: start,
      plannedEndTime: end,
      plannedDurationMinutes: duration ?? task.plannedDurationMinutes,
      schedulePendingTime: start ? false : true,
      updatedAt: new Date().toISOString(),
    });
    setEditingField(undefined);
  };

  /** 保存标题；空串或未变化则只退出编辑。 */
  const saveTitle = (input: string) => {
    const trimmed = input.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdate({
        ...task,
        title: trimmed,
        updatedAt: new Date().toISOString(),
      });
    }
    setEditingField(undefined);
  };

  /** 解析并写入预计时长。 */
  const savePlanned = (input: string) => {
    const duration = parseDurationInput(input);
    onUpdate({
      ...task,
      plannedDurationMinutes: duration,
      updatedAt: new Date().toISOString(),
    });
    setEditingField(undefined);
  };

  /** 解析并写入实际时长。 */
  const saveActual = (input: string) => {
    const duration = parseDurationInput(input);
    onUpdate({
      ...task,
      actualDurationMinutes: duration,
      updatedAt: new Date().toISOString(),
    });
    setEditingField(undefined);
  };

  const timeDisplay = task.plannedStartTime
    ? `${task.plannedStartTime}${task.plannedEndTime ? `–${task.plannedEndTime}` : ''}`
    : '';

  const stopDragOnControl = (event: React.DragEvent) => {
    event.stopPropagation();
  };

  const timeNode =
    timed &&
    (editingField === 'time' ? (
      <>
        <input
          className="tl-inline-input timeline-time-input timeline-time"
          defaultValue={timeDisplay}
          placeholder="08:30"
          autoFocus
          draggable={false}
          onDragStart={stopDragOnControl}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveTime(e.currentTarget.value);
            if (e.key === 'Escape') setEditingField(undefined);
          }}
          onBlur={(e) => saveTime(e.currentTarget.value)}
        />
        {timeError && <span className="timeline-inline-error" role="alert">{timeError}</span>}
      </>
    ) : (
      <time
        className={cn(
          'timeline-time',
          'tl-clickable-cell',
          !task.plannedStartTime && 'is-pending-time',
        )}
        onClick={() => !interactionLocked && setEditingField('time')}
        title="点击直接修改时间（支持 08:30 或 08:30-10:00）"
      >
        {timeDisplay || '—'}
      </time>
    ));

  const plannedNode =
    timed &&
    (editingField === 'planned' ? (
      <input
        className="tl-inline-input task-duration-input task-duration task-duration-planned"
        defaultValue={
          task.plannedDurationMinutes !== undefined
            ? `${task.plannedDurationMinutes}min`
            : ''
        }
        placeholder="45min"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') savePlanned(e.currentTarget.value);
          if (e.key === 'Escape') setEditingField(undefined);
        }}
        onBlur={(e) => savePlanned(e.currentTarget.value)}
      />
    ) : (
      <span
        className="task-duration task-duration-planned tl-clickable-cell"
        onClick={() => setEditingField('planned')}
        title="点击直接修改预计时长（如 45min 或 1h）"
      >
        <span className="task-duration-prefix">预计 </span>
        {formatMinutes(task.plannedDurationMinutes)}
      </span>
    ));

  const actualNode =
    timed &&
    (editingField === 'actual' ? (
      <input
        className="tl-inline-input task-duration-input task-duration task-duration-actual"
        defaultValue={
          task.actualDurationMinutes !== undefined
            ? `${task.actualDurationMinutes}min`
            : ''
        }
        placeholder="30min"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') saveActual(e.currentTarget.value);
          if (e.key === 'Escape') setEditingField(undefined);
        }}
        onBlur={(e) => saveActual(e.currentTarget.value)}
      />
    ) : (
      <span
        className="task-duration task-duration-actual tl-clickable-cell"
        onClick={() => setEditingField('actual')}
        title="点击直接输入实际时长（如 30min 或 1h20min）"
      >
        <span className="task-duration-prefix">实际 </span>
        {formatMinutes(task.actualDurationMinutes)}
      </span>
    ));

  const projectNode = (
    <div className="task-project-cell" ref={projectPickerRef}>
      {editingField === 'project' ? (
        <div className="project-picker-popover">
          <div className="project-picker-list">
            {projects
              .filter((p) => p.status === 'active' || p.id === task.projectId)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={cn(
                    'project-picker-item',
                    p.id === task.projectId && 'is-selected',
                  )}
                  onClick={() => {
                    onUpdate({
                      ...task,
                      projectId: p.id,
                      updatedAt: new Date().toISOString(),
                    });
                    setEditingField(undefined);
                  }}
                >
                  <ProjectTag name={p.name} color={p.color} />
                </button>
              ))}
          </div>
          {onAddProject && (
            <>
              <div className="project-picker-divider" />
              {isAddingProject ? (
                <div className="project-picker-new-form">
                  <input
                    placeholder="新项目名称"
                    value={newProjectName}
                    autoFocus
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateProject();
                      }
                      if (e.key === 'Escape') {
                        setIsAddingProject(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="tl-inline-confirm-btn"
                    onClick={handleCreateProject}
                    title="创建新项目"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    type="button"
                    className="tl-inline-cancel-btn"
                    onClick={() => setIsAddingProject(false)}
                    title="取消"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="project-picker-new-btn"
                  onClick={() => setIsAddingProject(true)}
                >
                  <Plus size={13} /> 新增项目
                </button>
              )}
            </>
          )}
        </div>
      ) : null}
      <span
        className="tl-clickable-cell"
        onClick={() => setEditingField('project')}
        title="点击切换所属项目或新增项目"
      >
        <ProjectTag
          name={project?.name ?? '未配置项目'}
          color={project?.color ?? '#8793a7'}
        />
      </span>
    </div>
  );

  return (
    <div
      className={cn(
        timed ? 'timeline-row' : 'quick-task-row',
        'task-row-draggable',
        task.completed && 'completed',
        isDragging && 'is-dragging',
        !canDrag && 'is-drag-disabled',
      )}
      draggable={canDrag && !editingField}
      onDragStart={(event) => {
        if (!canDrag || editingField) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData('text/task-id', task.id);
        event.dataTransfer.setData('text/plain', task.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
    >
      <div className="task-check-wrap">
        <Checkbox
          aria-label={`完成${task.title}`}
          checked={task.completed}
          onChange={(e) =>
            onUpdate({
              ...task,
              completed: e.target.checked,
              completedAt: e.target.checked ? new Date().toISOString() : undefined,
            })
          }
        />
      </div>

      <div className="task-content-wrap">
        {editingField === 'title' ? (
          <input
            className="tl-inline-input task-title-input task-title"
            defaultValue={task.title}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle(e.currentTarget.value);
              if (e.key === 'Escape') setEditingField(undefined);
            }}
            onBlur={(e) => saveTitle(e.currentTarget.value)}
          />
        ) : (
          <span
            className="task-title tl-clickable-cell"
            onClick={() => setEditingField('title')}
            title={task.title}
          >
            {task.title}
          </span>
        )}

        <div className="timeline-meta">
          {timed && timeNode}
          {projectNode}
          {timed && (
            <>
              {plannedNode}
              {actualNode}
            </>
          )}
        </div>
      </div>

      <TaskRowActions
        taskId={task.id}
        title={task.title}
        canChangeWorkflow={canChangeWorkflow}
        canDrag={canDrag}
        editingLocked={Boolean(editingField)}
        inWorkstation={inWorkstation}
        onEdit={onEdit}
        onMove={onMove}
        onReschedule={onReschedule}
        onToggleWorkstation={onToggleWorkstation}
        onPointerDragStart={onPointerDragStart}
        onPointerDragMove={onPointerDragMove}
        onPointerDragEnd={onPointerDragEnd}
      />
    </div>
  );
}
