/**
 * @fileoverview 任务工作台组件，提供仪表盘、任务列表、今日日程和弹窗交互。
 */

'use client';

import { useRef, useState, useEffect } from 'react';
import { AnnotationLayer, type AnnotationTool } from '@/components/annotation-layer';
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
import { CompactWindowHeader, useWorkspaceView } from '@/components/app-shell';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { resolveActiveProject } from '@/lib/project-rules';
import { MiniTodayPanel, WorkstationPanel } from '@/features/tasks/compact-workspace';
import { formatMinutes } from '@/features/tasks/task-time';
import { DesktopScheduleList } from '@/features/tasks/components/desktop-schedule-list';
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
import { useTaskCreateDrafts } from '@/features/tasks/hooks/use-task-create-drafts';
import { useTaskDashboardController } from '@/features/tasks/hooks/use-task-dashboard-controller';
import { useCloseDay } from '@/features/tasks/hooks/use-close-day';
import type { Task } from '@/types/domain';

/**
 * 按当前工作台视图渲染首页、功能页或 Electron 紧凑窗口。
 */
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
    updateDailyTemplates,
    dailyHistory,
    history,
    closeRecords,
    annotationStrokes,
    updateAnnotationStrokes,
    workstationTaskIds,
    updateWorkstationTaskIds,
    highlightColor,
    updateHighlightColor,
    createTask,
    transitionTask,
    recordDaily,
    closeDay: commitCloseDay,
    hydrated,
  } = useWorkspaceData();
  const defaultProjectId = resolveActiveProject(workspaceProjects)?.id ?? '';
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('none');
  const createDrafts = useTaskCreateDrafts();

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
    interactionLocked: annotationInteractionLocked,
    projects: workspaceProjects,
    selectedDate,
    tasks,
    updateAnnotationStrokes,
    updateTasks,
    updateWorkstationTaskIds,
    transitionTask,
  });

  const {
    createCompactQuickTask,
    createCompactTimedTask,
    createProjectDirectly,
    createQuickTask,
    createTimedTask,
    saveTask,
  } = useTaskCreateAndEdit({
    createTask,
    editing,
    projects: workspaceProjects,
    selectedDate,
    updateProjectList: updateProjects,
    updateTask: update,
  });

  const closeDay = useCloseDay({
    closeDay: commitCloseDay,
    daily,
    projects: workspaceProjects,
    selectedDate,
    shown,
    tomorrow,
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
        key={selectedDate}
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
        <>
          <p className="home-summary" aria-live="polite">
            <span className="home-summary-check" aria-hidden="true">
              ✓
            </span>
            今日任务 {normalTaskTotal} · 已完成 {done}
          </p>
          <Surface className="metric-strip" variant="flat">
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
        </>
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
          isAdding={createDrafts.timedOpen}
          onAdd={() => createDrafts.openTimed(defaultProjectId)}
          onCloseAdd={createDrafts.closeTimed}
          onDragLeave={() => setDropTarget(null)}
          onDragOver={handleScheduleDragOver}
          onDrop={handleScheduleDrop}
          onResizeStart={startResizeSchedule}
          onSelectAnnotationTool={setAnnotationTool}
          onSetHighlightColor={updateHighlightColor}
          onToggleEraser={() => toggleAnnotationTool('eraser')}
        >
          {() => (
            <DesktopScheduleList>
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
                open={createDrafts.timedOpen}
                draft={createDrafts.timedDraft}
                projects={workspaceProjects}
                onCreate={createTimedTask}
                onCreateProject={createProjectDirectly}
                onChange={createDrafts.updateTimedDraft}
                onReset={() => createDrafts.resetTimed(defaultProjectId)}
                onClose={createDrafts.closeTimed}
              />
            </DesktopScheduleList>
          )}
        </SchedulePanel>
        {!isMiniToday && (
          <div className="side-column">
            <QuickTaskPanel
              isDropTarget={dropTarget === 'quick'}
              isAdding={createDrafts.quickOpen}
              onAdd={() => createDrafts.openQuick(defaultProjectId)}
              onCloseAdd={createDrafts.closeQuick}
              onDragLeave={() => setDropTarget(null)}
              onDragOver={handleQuickDragOver}
              onDrop={handleQuickDrop}
            >
              {() => (
                <div className="quick-tasks">
                  {quick.length === 0 && !createDrafts.quickOpen ? (
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
                  <QuickTaskCreateRow
                    open={createDrafts.quickOpen}
                    draft={createDrafts.quickDraft}
                    projects={workspaceProjects}
                    onCreate={createQuickTask}
                    onCreateProject={createProjectDirectly}
                    onChange={createDrafts.updateQuickDraft}
                    onReset={() => createDrafts.resetQuick(defaultProjectId)}
                    onClose={createDrafts.closeQuick}
                  />
                </div>
              )}
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
                  const existing = current[selectedDate] ?? [];
                  return { ...current, [selectedDate]: [...existing, item] };
                });
              }}
              onRecord={(entry) =>
                void recordDaily(entry.dailyId, entry.date).catch(() => undefined)
              }
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
            void transitionTask(id, 'scheduled', selectedDate).catch(() => undefined);
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
