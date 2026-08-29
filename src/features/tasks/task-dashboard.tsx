/**
 * @fileoverview 任务工作台组件，提供仪表盘、任务列表、今日日程和弹窗交互。
 */

'use client';

import {
  Check,
  X,
} from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { AnnotationLayer, type AnnotationTool } from '@/components/annotation-layer';
import { Checkbox } from '@/components/ui/checkbox';
import { StatItem } from '@/components/ui/stat-item';
import { Surface } from '@/components/ui/surface';
import { DailyPanel } from '@/features/daily/daily-panel';
import { CalendarPanel } from '@/features/calendar/calendar-panel';
import { InsightsPanel } from '@/features/insights/insights-panel';
import { ProjectPanel } from '@/features/projects/project-panel';
import { RecordsPanel } from '@/features/records/records-panel';
import { RhythmPanel } from '@/features/rhythm/rhythm-panel';
import { SettingsPanel } from '@/features/settings/settings-panel';
import { useWorkspaceData } from '@/features/workspace/workspace-data-provider';
import { createDailyInstance } from '@/features/workspace/workspace-seed';
import { CompactWindowHeader, useWorkspaceView } from '@/components/app-shell';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import {
  MiniTodayPanel,
  WorkstationPanel,
} from '@/features/tasks/compact-workspace';
import { formatMinutes } from '@/features/tasks/task-time';
import { TaskLine } from '@/features/tasks/components/task-line';
import { SchedulePanel } from '@/features/tasks/components/schedule-panel';
import { QuickTaskPanel } from '@/features/tasks/components/quick-task-panel';
import { PlanningQueue } from '@/features/tasks/components/planning-queue';
import {
  CloseDialog,
  RescheduleDialog,
  TaskDialog,
} from '@/features/tasks/components/task-dialogs';
import { useScheduleResize } from '@/features/tasks/hooks/use-schedule-resize';
import { useTaskDragAndDrop } from '@/features/tasks/hooks/use-task-drag-and-drop';
import { useWorkstationMembership } from '@/features/tasks/hooks/use-workstation-membership';
import { useTaskDashboardData } from '@/features/tasks/hooks/use-task-dashboard-data';
import { useTaskWorkflow } from '@/features/tasks/hooks/use-task-workflow';
import { useTaskCreateAndEdit } from '@/features/tasks/hooks/use-task-create-and-edit';
import type { HistoryEvent, Task } from '@/types/domain';

export function TaskDashboard() {
  const { active, selectedDate, setSelectedDate } = useWorkspaceView();
  const { isMiniToday, isWorkstation } = useDesktopWindow();
  const {
    tasks,
    updateTasks,
    projects: workspaceProjects,
    updateProjects,
    dailyByDate,
    updateDailyByDate,
    dailyTemplates,
    updateDailyTemplates,
    dailyHistory,
    updateDailyHistory,
    history,
    updateHistory,
    closeRecords,
    updateCloseRecords,
    annotationStrokes,
    updateAnnotationStrokes,
    workstationTaskIds,
    updateWorkstationTaskIds,
    highlightColor,
    updateHighlightColor,
    hydrated,
  } = useWorkspaceData();
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('none');
  const [autoFocusTimeTaskId, setAutoFocusTimeTaskId] = useState<string | null>(null);

  const [addingTimedRow, setAddingTimedRow] = useState(false);
  const [newTimedStartTime, setNewTimedStartTime] = useState('');
  const [newTimedEndTime, setNewTimedEndTime] = useState('');
  const [newTimedTimeError, setNewTimedTimeError] = useState<string>();
  const [newTimedCompleted, setNewTimedCompleted] = useState(false);
  const [newTimedProjectId, setNewTimedProjectId] = useState('work');
  const [newTimedTitle, setNewTimedTitle] = useState('');
  const [newTimedPlanned, setNewTimedPlanned] = useState('');
  const [newTimedActual, setNewTimedActual] = useState('');
  const [isAddingTimedProject, setIsAddingTimedProject] = useState(false);
  const [newTimedProjectName, setNewTimedProjectName] = useState('');
  const timedProjectPickerRef = useRef<HTMLDivElement>(null);

  const [addingQuickRow, setAddingQuickRow] = useState(false);
  const [newQuickCompleted, setNewQuickCompleted] = useState(false);
  const [newQuickProjectId, setNewQuickProjectId] = useState('work');
  const [newQuickTitle, setNewQuickTitle] = useState('');
  const [isAddingQuickProject, setIsAddingQuickProject] = useState(false);
  const [newQuickProjectName, setNewQuickProjectName] = useState('');
  const quickProjectPickerRef = useRef<HTMLDivElement>(null);

  const { isResizingSchedule, scheduleRatio, startResizeSchedule } = useScheduleResize();

  const [editing, setEditing] = useState<Task | undefined>();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDialogMode, setTaskDialogMode] = useState<'normal' | 'unscheduled'>(
    'normal',
  );
  const [rescheduling, setRescheduling] = useState<Task | undefined>();
  const closeDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (annotationTool === 'none') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAnnotationTool('none');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [annotationTool]);

  const {
    actual,
    analyticsInput,
    backlog,
    daily,
    dailyActual,
    dailyDone,
    done,
    isDayClosed,
    normalTaskTotal,
    quick,
    shown,
    timed,
    tomorrow,
  } = useTaskDashboardData({
    closeRecords,
    dailyByDate,
    dailyHistory,
    dailyTemplates,
    projects: workspaceProjects,
    selectedDate,
    tasks,
  });
  const annotationInteractionLocked = annotationTool !== 'none';

  const toggleAnnotationTool = (tool: AnnotationTool) => {
    setAnnotationTool((current) => (current === tool ? 'none' : tool));
  };

  const {
    appendHistory,
    moveTask: move,
    rescheduleTask,
    updateTask: update,
  } = useTaskWorkflow({
    selectedDate,
    tasks,
    updateAnnotationStrokes,
    updateHistory,
    updateTasks,
    updateWorkstationTaskIds,
  });

  const { clearWorkstation, reorderWorkstation, toggleWorkstationTask } =
    useWorkstationMembership(updateWorkstationTaskIds);

  const {
    createCompactQuickTask,
    createCompactTimedTask,
    createProjectDirectly,
    createQuickTask,
    createTimedTask,
    saveTask,
  } = useTaskCreateAndEdit({
    appendHistory,
    editing,
    projects: workspaceProjects,
    selectedDate,
    updateProjectList: updateProjects,
    updateTask: update,
    updateTasks,
  });

  /** 调用动作层创建日程任务，并保持既有字段重置顺序。 */
  const handleConfirmAddTimed = () => {
    const result = createTimedTask({
      actual: newTimedActual,
      completed: newTimedCompleted,
      endTime: newTimedEndTime,
      planned: newTimedPlanned,
      projectId: newTimedProjectId,
      startTime: newTimedStartTime,
      title: newTimedTitle,
    });
    if ('error' in result) {
      setNewTimedTimeError(result.error);
      return;
    }
    setNewTimedTimeError(undefined);
    setNewTimedStartTime('');
    setNewTimedEndTime('');
    setNewTimedTitle('');
    setNewTimedPlanned('');
    setNewTimedActual('');
    setNewTimedCompleted(false);
    setAddingTimedRow(false);
  };

  /** 调用动作层创建无时间待办，并保持既有空标题取消行为。 */
  const handleConfirmAddQuick = () => {
    createQuickTask({
      completed: newQuickCompleted,
      projectId: newQuickProjectId,
      title: newQuickTitle,
    });
    setNewQuickTitle('');
    setNewQuickCompleted(false);
    setAddingQuickRow(false);
  };

  /**
   * 将无时间任务移动到日程，保留同一条记录并设为持久化的待填时间状态。
   */
  const moveTaskToSchedule = (taskId: string) => {
    const task = shown.find((item) => item.id === taskId);
    if (!task || task.plannedStartTime || task.schedulePendingTime) return;
    update({
      ...task,
      schedulePendingTime: true,
      plannedStartTime: undefined,
      plannedEndTime: undefined,
      plannedDurationMinutes: undefined,
      updatedAt: new Date().toISOString(),
    });
    setAutoFocusTimeTaskId(taskId);
  };

  /**
   * 将日程任务移回无时间待办，清理待填状态和全部排程字段。
   */
  const moveTaskToQuick = (taskId: string) => {
    const task = shown.find((item) => item.id === taskId);
    if (!task) return;
    update({
      ...task,
      schedulePendingTime: false,
      plannedStartTime: undefined,
      plannedEndTime: undefined,
      plannedDurationMinutes: undefined,
      updatedAt: new Date().toISOString(),
    });
  };

  /**
   * 记录拖拽源以呈现视觉反馈；不锁定落点，避免阻断原生 drop 事件。
   */

  const dragAndDrop = useTaskDragAndDrop({
    interactionLocked: annotationInteractionLocked,
    onMoveToQuick: moveTaskToQuick,
    onMoveToSchedule: moveTaskToSchedule,
  });
  const {
    draggingTaskId,
    dropTarget,
    handlePointerDragEnd,
    handlePointerDragMove,
    handlePointerDragStart,
    handleQuickDragOver,
    handleQuickDrop,
    handleScheduleDragOver,
    handleScheduleDrop,
    handleTaskDragEnd,
    handleTaskDragStart,
    setDropTarget,
  } = dragAndDrop;

  if (!hydrated)
    return (
      <Surface className="workspace-loading">
        <p>正在载入工作台…</p>
      </Surface>
    );

  const open = (task?: Task, mode: 'normal' | 'unscheduled' = 'normal') => {
    setEditing(task);
    setTaskDialogMode(mode);
    setTaskDialogOpen(true);
  };
  /** 由动作层验证并写入 Dialog 内容；仅在成功时关闭原有弹窗。 */
  const save = (form: FormData): string | undefined => {
    const message = saveTask(form);
    if (!message) setTaskDialogOpen(false);
    return message;
  };
  /** 将当前移期弹窗的任务交给 workflow，并只在成功后关闭弹窗。 */
  const reschedule = (targetDate: string) => {
    const message = rescheduleTask(rescheduling, targetDate);
    if (!message && rescheduling) setRescheduling(undefined);
    return message;
  };
  if (isMiniToday)
    return (
      <>
        <CompactWindowHeader />
        <MiniTodayPanel
          timed={timed}
          quick={quick}
          projects={workspaceProjects}
          workstationTaskIds={workstationTaskIds}
          onUpdateTask={update}
          onToggleWorkstation={toggleWorkstationTask}
          onClearWorkstation={clearWorkstation}
          onReorderWorkstation={reorderWorkstation}
          onCreateTimedTask={createCompactTimedTask}
          onCreateQuickTask={createCompactQuickTask}
        />
      </>
    );
  if (isWorkstation)
    return (
      <>
        <CompactWindowHeader onClearWorkstation={clearWorkstation} />
        <WorkstationPanel
          tasks={tasks.filter((task) => task.status !== 'trashed')}
          projects={workspaceProjects}
          workstationTaskIds={workstationTaskIds}
          onToggleWorkstation={toggleWorkstationTask}
          onReorderWorkstation={reorderWorkstation}
        />
      </>
    );
  if (active === 'projects')
    return (
      <ProjectPanel
        items={workspaceProjects}
        tasks={tasks}
        daily={daily}
        dailyHistory={dailyHistory}
        onChange={updateProjects}
      />
    );
  if (active === 'calendar')
    return (
      <CalendarPanel
        analyticsInput={analyticsInput}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
    );
  if (active === 'insights')
    return (
      <InsightsPanel analyticsInput={analyticsInput} selectedDate={selectedDate} />
    );
  if (active === 'records')
    return (
      <RecordsPanel
        tasks={tasks}
        projects={workspaceProjects}
        history={history}
        dailyHistory={dailyHistory}
        closeRecords={closeRecords}
      />
    );
  if (active === 'rhythm') return <RhythmPanel selectedDate={selectedDate} />;
  if (active === 'settings')
    return <SettingsPanel tasks={tasks} onUpdateTask={update} />;
  return (
    <div className="dashboard dashboard-annotatable" data-testid="home-panel">
      {!isMiniToday && (
        <Surface className="metric-strip">
          <StatItem
            label="普通任务"
            value={
              <>
                <em>{done}</em>
                <small>/ {normalTaskTotal}</small>
              </>
            }
          />
          <StatItem
            label="Daily"
            value={
              <>
                <em>{dailyDone}</em>
                <small>/ {daily.length}</small>
              </>
            }
          />
          <StatItem
            label="普通实际"
            value={
              <>
                <em>{formatMinutes(actual)}</em>
              </>
            }
          />
          <StatItem
            label="Daily 实际"
            value={
              <>
                <em>{formatMinutes(dailyActual)}</em>
              </>
            }
          />
          <StatItem
            label="今日总实际"
            value={
              <>
                <em>{formatMinutes(actual + dailyActual)}</em>
              </>
            }
          />
        </Surface>
      )}
      <div
        className={`dashboard-columns${isMiniToday ? 'is-mini-today' : ''}`}
        style={{ '--schedule-ratio': `${scheduleRatio}fr` } as React.CSSProperties}
        onPointerMove={handlePointerDragMove}
        onPointerUp={handlePointerDragEnd}
      >
        <SchedulePanel
          annotationTool={annotationTool}
          highlightColor={highlightColor}
          isDropTarget={dropTarget === 'schedule'}
          isFullWorkspace={!isMiniToday}
          isResizing={isResizingSchedule}
          onAdd={() => {
            setAddingTimedRow(true);
            setNewTimedProjectId(workspaceProjects[0]?.id ?? 'work');
          }}
          onDragLeave={() => setDropTarget(null)}
          onDragOver={handleScheduleDragOver}
          onDrop={handleScheduleDrop}
          onResizeStart={startResizeSchedule}
          onSelectAnnotationTool={setAnnotationTool}
          onSetHighlightColor={updateHighlightColor}
          onToggleEraser={() => toggleAnnotationTool('eraser')}
        >
          <div className="timeline-scroll">
            <div className="timeline-head">
              <span className="timeline-col-time">时间</span>
              <span className="timeline-col-check"></span>
              <span className="timeline-col-project">项目</span>
              <span className="timeline-col-title">任务</span>
              <span className="timeline-col-planned">预计</span>
              <span className="timeline-col-actual">实际</span>
              <span className="timeline-col-actions">操作</span>
            </div>
            {timed.map((task) => (
              <TaskLine
                key={task.id}
                task={task}
                onUpdate={update}
                onEdit={() => open(task, 'normal')}
                onMove={move}
                onReschedule={() => setRescheduling(task)}
                projects={workspaceProjects}
                onAddProject={createProjectDirectly}
                draggable={!annotationInteractionLocked}
                isDragging={draggingTaskId === task.id}
                autoFocusTime={autoFocusTimeTaskId === task.id}
                onTimeFocused={() => setAutoFocusTimeTaskId(null)}
                interactionLocked={annotationInteractionLocked}
                onDragStart={() => handleTaskDragStart(task.id)}
                onDragEnd={handleTaskDragEnd}
                onPointerDragStart={(event) => handlePointerDragStart(task.id, event)}
                onPointerDragMove={handlePointerDragMove}
                onPointerDragEnd={handlePointerDragEnd}
                inWorkstation={workstationTaskIds.includes(task.id)}
                onToggleWorkstation={toggleWorkstationTask}
                inSchedulePanel
              />
            ))}

            {addingTimedRow && (
              <div className="timeline-row timeline-row-adding">
                <div className="timeline-time-range-inputs">
                  <input
                    className="tl-inline-input timeline-time-input"
                    aria-label="开始时间"
                    placeholder="08:30"
                    value={newTimedStartTime}
                    autoFocus
                    onChange={(e) => {
                      setNewTimedStartTime(e.target.value);
                      setNewTimedTimeError(undefined);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmAddTimed();
                      if (e.key === 'Escape') setAddingTimedRow(false);
                    }}
                  />
                  <span aria-hidden="true">→</span>
                  <input
                    className="tl-inline-input timeline-time-input"
                    aria-label="结束时间"
                    placeholder="10:00"
                    value={newTimedEndTime}
                    onChange={(e) => {
                      setNewTimedEndTime(e.target.value);
                      setNewTimedTimeError(undefined);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmAddTimed();
                      if (e.key === 'Escape') setAddingTimedRow(false);
                    }}
                  />
                  {newTimedTimeError && (
                    <span className="timeline-inline-error">{newTimedTimeError}</span>
                  )}
                </div>
                <div className="task-check-wrap">
                  <Checkbox
                    checked={newTimedCompleted}
                    onChange={(e) => setNewTimedCompleted(e.target.checked)}
                  />
                </div>
                <div style={{ position: 'relative' }} ref={timedProjectPickerRef}>
                  <select
                    className="tl-inline-select project-inline-select"
                    value={newTimedProjectId}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setIsAddingTimedProject(true);
                      } else {
                        setNewTimedProjectId(e.target.value);
                      }
                    }}
                  >
                    {workspaceProjects
                      .filter((p) => p.status === 'active')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    <option value="__new__">+ 新增项目…</option>
                  </select>
                  {isAddingTimedProject && (
                    <div className="project-picker-popover">
                      <div className="project-picker-new-form">
                        <input
                          placeholder="新项目名称"
                          value={newTimedProjectName}
                          autoFocus
                          onChange={(e) => setNewTimedProjectName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (newTimedProjectName.trim()) {
                                const created = createProjectDirectly(
                                  newTimedProjectName.trim(),
                                );
                                setNewTimedProjectId(created.id);
                                setNewTimedProjectName('');
                                setIsAddingTimedProject(false);
                              }
                            }
                            if (e.key === 'Escape') setIsAddingTimedProject(false);
                          }}
                        />
                        <button
                          type="button"
                          className="tl-inline-confirm-btn"
                          onClick={() => {
                            if (newTimedProjectName.trim()) {
                              const created = createProjectDirectly(
                                newTimedProjectName.trim(),
                              );
                              setNewTimedProjectId(created.id);
                              setNewTimedProjectName('');
                              setIsAddingTimedProject(false);
                            }
                          }}
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          className="tl-inline-cancel-btn"
                          onClick={() => setIsAddingTimedProject(false)}
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
                  value={newTimedTitle}
                  onChange={(e) => setNewTimedTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmAddTimed();
                    if (e.key === 'Escape') setAddingTimedRow(false);
                  }}
                />
                <input
                  className="tl-inline-input task-duration-input"
                  placeholder="45min"
                  value={newTimedPlanned}
                  onChange={(e) => setNewTimedPlanned(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmAddTimed();
                    if (e.key === 'Escape') setAddingTimedRow(false);
                  }}
                />
                <input
                  className="tl-inline-input task-duration-input"
                  placeholder="实际耗时"
                  value={newTimedActual}
                  onChange={(e) => setNewTimedActual(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmAddTimed();
                    if (e.key === 'Escape') setAddingTimedRow(false);
                  }}
                />
                <div className="tl-inline-actions-cell">
                  <button
                    type="button"
                    className="tl-inline-confirm-btn"
                    onClick={handleConfirmAddTimed}
                    title="保存任务"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    className="tl-inline-cancel-btn"
                    onClick={() => setAddingTimedRow(false)}
                    title="取消"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </SchedulePanel>
        {!isMiniToday && (
          <div className="side-column">
            <QuickTaskPanel
              isDropTarget={dropTarget === 'quick'}
              onAdd={() => {
                setAddingQuickRow(true);
                setNewQuickProjectId(workspaceProjects[0]?.id ?? 'other');
              }}
              onDragLeave={() => setDropTarget(null)}
              onDragOver={handleQuickDragOver}
              onDrop={handleQuickDrop}
            >
              <div className="quick-tasks">
                {quick.length === 0 && !addingQuickRow ? (
                  <p className="empty-copy">暂无未定时间的待办事项</p>
                ) : (
                  quick.map((task) => (
                    <TaskLine
                      key={task.id}
                      task={task}
                      onUpdate={update}
                      onEdit={() => open(task, 'unscheduled')}
                      onMove={move}
                      onReschedule={() => setRescheduling(task)}
                      projects={workspaceProjects}
                      onAddProject={createProjectDirectly}
                      draggable={!annotationInteractionLocked}
                      isDragging={draggingTaskId === task.id}
                      interactionLocked={annotationInteractionLocked}
                      onDragStart={() => handleTaskDragStart(task.id)}
                      onDragEnd={handleTaskDragEnd}
                      onPointerDragStart={(event) =>
                        handlePointerDragStart(task.id, event)
                      }
                      onPointerDragMove={handlePointerDragMove}
                      onPointerDragEnd={handlePointerDragEnd}
                      inWorkstation={workstationTaskIds.includes(task.id)}
                      onToggleWorkstation={toggleWorkstationTask}
                    />
                  ))
                )}

                {addingQuickRow && (
                  <div className="quick-task-row quick-task-row-adding">
                    <div className="task-check-wrap">
                      <Checkbox
                        checked={newQuickCompleted}
                        onChange={(e) => setNewQuickCompleted(e.target.checked)}
                      />
                    </div>
                    <div style={{ position: 'relative' }} ref={quickProjectPickerRef}>
                      <select
                        className="tl-inline-select project-inline-select"
                        value={newQuickProjectId}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setIsAddingQuickProject(true);
                          } else {
                            setNewQuickProjectId(e.target.value);
                          }
                        }}
                      >
                        {workspaceProjects
                          .filter((p) => p.status === 'active')
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        <option value="__new__">+ 新增项目…</option>
                      </select>
                      {isAddingQuickProject && (
                        <div className="project-picker-popover">
                          <div className="project-picker-new-form">
                            <input
                              placeholder="新项目名称"
                              value={newQuickProjectName}
                              autoFocus
                              onChange={(e) => setNewQuickProjectName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (newQuickProjectName.trim()) {
                                    const created = createProjectDirectly(
                                      newQuickProjectName.trim(),
                                    );
                                    setNewQuickProjectId(created.id);
                                    setNewQuickProjectName('');
                                    setIsAddingQuickProject(false);
                                  }
                                }
                                if (e.key === 'Escape') setIsAddingQuickProject(false);
                              }}
                            />
                            <button
                              type="button"
                              className="tl-inline-confirm-btn"
                              onClick={() => {
                                if (newQuickProjectName.trim()) {
                                  const created = createProjectDirectly(
                                    newQuickProjectName.trim(),
                                  );
                                  setNewQuickProjectId(created.id);
                                  setNewQuickProjectName('');
                                  setIsAddingQuickProject(false);
                                }
                              }}
                            >
                              <Check size={13} />
                            </button>
                            <button
                              type="button"
                              className="tl-inline-cancel-btn"
                              onClick={() => setIsAddingQuickProject(false)}
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
                      value={newQuickTitle}
                      autoFocus
                      onChange={(e) => setNewQuickTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmAddQuick();
                        if (e.key === 'Escape') setAddingQuickRow(false);
                      }}
                    />
                    <div className="tl-inline-actions-cell">
                      <button
                        type="button"
                        className="tl-inline-confirm-btn"
                        onClick={handleConfirmAddQuick}
                        title="保存待办"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        className="tl-inline-cancel-btn"
                        onClick={() => setAddingQuickRow(false)}
                        title="取消"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </QuickTaskPanel>
            <DailyPanel
              items={daily}
              history={dailyHistory}
              date={selectedDate}
              projects={workspaceProjects}
              onChange={(items) =>
                updateDailyByDate((current) => ({ ...current, [selectedDate]: items }))
              }
              onAdd={(item) => {
                updateDailyTemplates((current) => [...current, item]);
                updateDailyByDate((current) => {
                  const existing =
                    current[selectedDate] ??
                    createDailyInstance(selectedDate, dailyTemplates);
                  return { ...current, [selectedDate]: [...existing, item] };
                });
              }}
              onRecord={(entry) => updateDailyHistory((current) => [entry, ...current])}
            />
          </div>
        )}
      </div>
      {!isMiniToday && (
        <PlanningQueue
          tasks={backlog}
          projects={workspaceProjects}
          onUpdate={update}
          onMove={move}
          onArrange={(id) => {
            updateTasks((current) =>
              current.map((task) =>
                task.id === id
                  ? {
                      ...task,
                      status: 'active',
                      date: selectedDate,
                      updatedAt: new Date().toISOString(),
                    }
                  : task,
              ),
            );
            appendHistory('scheduled', id, { toDate: selectedDate });
          }}
        />
      )}
      {!isMiniToday && (
        <button
          className="finish-day"
          disabled={isDayClosed}
          onClick={() => closeDialog.current?.showModal()}
        >
          {isDayClosed ? '今日已结束' : '结束今天'}
        </button>
      )}
      <AnnotationLayer
        activeTool={annotationTool}
        highlightColor={highlightColor}
        strokes={annotationStrokes}
        onChangeStrokes={updateAnnotationStrokes}
        targetDate={selectedDate}
        disabled={false}
      />
      <TaskDialog
        open={taskDialogOpen}
        mode={taskDialogMode}
        editing={editing}
        projects={workspaceProjects}
        onSave={save}
        onClose={() => setTaskDialogOpen(false)}
      />
      <RescheduleDialog
        task={rescheduling}
        defaultDate={tomorrow}
        onSave={reschedule}
        onClose={() => setRescheduling(undefined)}
      />
      <CloseDialog
        dialog={closeDialog}
        tasks={shown}
        actual={actual}
        dailyDone={dailyDone}
        dailyCount={daily.length}
        dailyActual={dailyActual}
        tomorrow={tomorrow}
        onCloseDay={(form) => {
          const events: HistoryEvent[] = [];
          updateTasks((current) =>
            current.map((task) => {
              const action = form.get(`action-${task.id}`);
              if (!action || task.completed) return task;
              const target = String(form.get(`date-${task.id}`) ?? '');
              events.push({
                id: crypto.randomUUID(),
                taskId: task.id,
                type: `close_${action}`,
                occurredAt: new Date().toISOString(),
                payload: {
                  fromDate: selectedDate,
                  ...(action === 'tomorrow' ? { toDate: tomorrow } : {}),
                  ...(action === 'date' && target ? { toDate: target } : {}),
                },
              });
              if (action === 'tomorrow')
                return {
                  ...task,
                  date: tomorrow,
                  status: 'active',
                  postponedFrom: selectedDate,
                  postponedTo: tomorrow,
                };
              if (action === 'backlog')
                return { ...task, status: 'backlog', date: undefined };
              if (action === 'abandoned')
                return {
                  ...task,
                  status: 'abandoned',
                  abandonedAt: new Date().toISOString(),
                };
              return target
                ? {
                    ...task,
                    date: target,
                    status: 'active',
                    postponedFrom: selectedDate,
                    postponedTo: target,
                  }
                : task;
            }),
          );
          updateHistory((current) => [...events, ...current]);
          updateDailyHistory((current) => [
            ...daily
              .filter(
                (item) =>
                  !current.some(
                    (entry) => entry.dailyId === item.id && entry.date === selectedDate,
                  ),
              )
              .map((item) => ({
                dailyId: item.id,
                projectId: item.projectId,
                date: selectedDate,
                completed:
                  item.completed || item.children.some((child) => child.completed),
                actual: item.actual,
                result: item.result,
              })),
            ...current,
          ]);
          const projectMinutes = Object.fromEntries(
            workspaceProjects.map((project) => [
              project.id,
              shown
                .filter((task) => task.projectId === project.id)
                .reduce((total, task) => total + (task.actualDurationMinutes ?? 0), 0) +
                daily
                  .filter((item) => item.projectId === project.id)
                  .reduce((total, item) => total + item.actual, 0),
            ]),
          );
          updateCloseRecords((current) => [
            ...current.filter((record) => record.date !== selectedDate),
            {
              id: crypto.randomUUID(),
              date: selectedDate,
              closedAt: new Date().toISOString(),
              projectMinutes,
            },
          ]);
          closeDialog.current?.close();
        }}
      />
    </div>
  );
}


