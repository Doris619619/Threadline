/**
 * @fileoverview 任务工作台组件，提供仪表盘、任务列表、今日日程和弹窗交互。
 */

'use client';

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
import { TimedTaskCreateRow } from '@/features/tasks/components/timed-task-create-row';
import { QuickTaskCreateRow } from '@/features/tasks/components/quick-task-create-row';
import { SchedulePanel } from '@/features/tasks/components/schedule-panel';
import { QuickTaskPanel } from '@/features/tasks/components/quick-task-panel';
import { PlanningQueue } from '@/features/tasks/components/planning-queue';
import {
  CloseDialog,
  RescheduleDialog,
  TaskDialog,
} from '@/features/tasks/components/task-dialogs';
import { useTaskCreateAndEdit } from '@/features/tasks/hooks/use-task-create-and-edit';
import { useTaskDashboardController } from '@/features/tasks/hooks/use-task-dashboard-controller';
import { useCloseDay } from '@/features/tasks/hooks/use-close-day';
import type { Task } from '@/types/domain';

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

  const annotationInteractionLocked = annotationTool !== 'none';

  const toggleAnnotationTool = (tool: AnnotationTool) => {
    setAnnotationTool((current) => (current === tool ? 'none' : tool));
  };

  const {
    actual,
    analyticsInput,
    appendHistory,
    autoFocusTimeTaskId,
    backlog,
    clearWorkstation,
    daily,
    dailyActual,
    dailyDone,
    done,
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
    isDayClosed,
    isResizingSchedule,
    moveTask: move,
    normalTaskTotal,
    quick,
    reorderWorkstation,
    rescheduleTask,
    scheduleRatio,
    setAutoFocusTimeTaskId,
    setDropTarget,
    shown,
    startResizeSchedule,
    timed,
    toggleWorkstationTask,
    tomorrow,
    updateTask: update,
  } = useTaskDashboardController({
    closeRecords,
    dailyByDate,
    dailyHistory,
    dailyTemplates,
    interactionLocked: annotationInteractionLocked,
    projects: workspaceProjects,
    selectedDate,
    tasks,
    updateAnnotationStrokes,
    updateHistory,
    updateTasks,
    updateWorkstationTaskIds,
  });

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

  const closeDay = useCloseDay({
    daily,
    projects: workspaceProjects,
    selectedDate,
    shown,
    tomorrow,
    updateCloseRecords,
    updateDailyHistory,
    updateHistory,
    updateTasks,
  });
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
          onDragLeave={() => setDropTarget(null)}
          onDragOver={handleScheduleDragOver}
          onDrop={handleScheduleDrop}
          onResizeStart={startResizeSchedule}
          onSelectAnnotationTool={setAnnotationTool}
          onSetHighlightColor={updateHighlightColor}
          onToggleEraser={() => toggleAnnotationTool('eraser')}
        >
          {({ isAdding, closeAdd }) => (
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
              <TimedTaskCreateRow
                open={isAdding}
                projects={workspaceProjects}
                defaultProjectId={workspaceProjects[0]?.id ?? 'work'}
                onCreate={createTimedTask}
                onCreateProject={createProjectDirectly}
                onClose={closeAdd}
              />
            </div>
          )}
        </SchedulePanel>
        {!isMiniToday && (
          <div className="side-column">
            <QuickTaskPanel
              isDropTarget={dropTarget === 'quick'}
              onDragLeave={() => setDropTarget(null)}
              onDragOver={handleQuickDragOver}
              onDrop={handleQuickDrop}
            >
              {({ isAdding, closeAdd }) => (
                <div className="quick-tasks">
                  {quick.length === 0 && !isAdding ? (
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
                        onPointerDragStart={(event) => handlePointerDragStart(task.id, event)}
                        onPointerDragMove={handlePointerDragMove}
                        onPointerDragEnd={handlePointerDragEnd}
                        inWorkstation={workstationTaskIds.includes(task.id)}
                        onToggleWorkstation={toggleWorkstationTask}
                      />
                    ))
                  )}
                  <QuickTaskCreateRow
                    open={isAdding}
                    projects={workspaceProjects}
                    defaultProjectId={workspaceProjects[0]?.id ?? 'other'}
                    onCreate={createQuickTask}
                    onCreateProject={createProjectDirectly}
                    onClose={closeAdd}
                  />
                </div>
              )}
            </QuickTaskPanel>            <DailyPanel
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
        onCloseDay={closeDay}
      />
    </div>
  );
}

