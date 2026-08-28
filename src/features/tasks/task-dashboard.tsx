/**
 * @fileoverview 任务工作台组件，提供仪表盘、任务列表、今日日程和弹窗交互。
 */

'use client';

import {
  Check,
  Eraser,
  GripVertical,
  MousePointer2,
  Plus,
  X,
} from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { AnnotationLayer, type AnnotationTool } from '@/components/annotation-layer';
import { AnnotationColorPicker } from '@/components/annotation-color-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { StatItem } from '@/components/ui/stat-item';
import { Surface } from '@/components/ui/surface';
import { calculateDuration, canTransitionTask } from '@/lib/task-rules';
import { taskFormSchema } from '@/lib/schemas';
import { DailyPanel } from '@/features/daily/daily-panel';
import { CalendarPanel } from '@/features/calendar/calendar-panel';
import { InsightsPanel } from '@/features/insights/insights-panel';
import { ProjectPanel } from '@/features/projects/project-panel';
import { RecordsPanel } from '@/features/records/records-panel';
import { RhythmPanel } from '@/features/rhythm/rhythm-panel';
import { SettingsPanel } from '@/features/settings/settings-panel';
import { useWorkspaceData } from '@/features/workspace/workspace-data-provider';
import { createDailyInstance, makeTask } from '@/features/workspace/workspace-seed';
import { CompactWindowHeader, useWorkspaceView } from '@/components/app-shell';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { addLocalDateDays, getLocalDateKey } from '@/lib/local-date';
import {
  MiniTodayPanel,
  WorkstationPanel,
  type CompactQuickTaskDraft,
  type CompactTimedTaskDraft,
} from '@/features/tasks/compact-workspace';
import {
  formatMinutes,
  normalizeTime,
  parseDurationInput,
} from '@/features/tasks/task-time';
import { TaskLine } from '@/features/tasks/components/task-line';
import { PlanningQueue } from '@/features/tasks/components/planning-queue';
import {
  CloseDialog,
  RescheduleDialog,
  TaskDialog,
} from '@/features/tasks/components/task-dialogs';
import type { HistoryEvent, Project, Task, TaskStatus } from '@/types/domain';

type TaskDropZone = 'schedule' | 'quick';

/** 完整工作台初始时让日程列略宽于右侧待办列，保留用户后续拖拽调整能力。 */
const DEFAULT_SCHEDULE_RATIO = 1.8;

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
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const draggingTaskIdRef = useRef<string | null>(null);
  const pointerDragRef = useRef<{ taskId: string; pointerId: number } | undefined>(
    undefined,
  );
  const [dropTarget, setDropTarget] = useState<TaskDropZone | null>(null);
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

  const [scheduleRatio, setScheduleRatio] = useState<number>(DEFAULT_SCHEDULE_RATIO);
  const [isResizingSchedule, setIsResizingSchedule] = useState(false);
  const resizeStartXRef = useRef<number>(0);
  const resizeStartRatioRef = useRef<number>(DEFAULT_SCHEDULE_RATIO);

  const createProjectDirectly = (name: string): Project => {
    const trimmed = name.trim();
    const colors = ['#4f8cff', '#8b7cf6', '#38a774', '#e9a04b', '#ec4899', '#06b6d4'];
    const randomColor = colors[workspaceProjects.length % colors.length];
    const newProj: Project = {
      id: crypto.randomUUID(),
      name: trimmed,
      color: randomColor,
      status: 'active',
      createdAt: getLocalDateKey(),
    };
    updateProjects((current) => [...current, newProj]);
    return newProj;
  };

  /** 校验两个直观时间输入，并把有效范围同步为任务预计时长。 */
  const handleConfirmAddTimed = () => {
    if (!newTimedTitle.trim()) {
      setAddingTimedRow(false);
      return;
    }
    const start = normalizeTime(newTimedStartTime);
    const end = normalizeTime(newTimedEndTime);
    if (newTimedStartTime.trim() && !start) {
      setNewTimedTimeError('开始时间格式应为 08:30');
      return;
    }
    if (newTimedEndTime.trim() && (!start || !end || end <= start)) {
      setNewTimedTimeError('结束时间需晚于有效的开始时间');
      return;
    }
    setNewTimedTimeError(undefined);
    const duration = start && end ? calculateDuration(start, end) : undefined;
    const plannedDuration = parseDurationInput(newTimedPlanned) ?? duration;
    const actualDuration = parseDurationInput(newTimedActual);
    const newTask: Task = {
      id: crypto.randomUUID(),
      projectId: newTimedProjectId,
      title: newTimedTitle.trim(),
      date: selectedDate,
      plannedStartTime: start,
      schedulePendingTime: !start,
      plannedEndTime: end,
      plannedDurationMinutes: plannedDuration,
      actualDurationMinutes: actualDuration,
      completed: newTimedCompleted,
      completedAt: newTimedCompleted ? new Date().toISOString() : undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateTasks((current) => [...current, newTask]);
    appendHistory('created', newTask.id, { title: newTask.title });
    setNewTimedStartTime('');
    setNewTimedEndTime('');
    setNewTimedTitle('');
    setNewTimedPlanned('');
    setNewTimedActual('');
    setNewTimedCompleted(false);
    setAddingTimedRow(false);
  };

  const handleConfirmAddQuick = () => {
    if (!newQuickTitle.trim()) {
      setAddingQuickRow(false);
      return;
    }
    const newTask: Task = {
      id: crypto.randomUUID(),
      projectId: newQuickProjectId,
      title: newQuickTitle.trim(),
      date: selectedDate,
      completed: newQuickCompleted,
      completedAt: newQuickCompleted ? new Date().toISOString() : undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateTasks((current) => [...current, newTask]);
    appendHistory('created', newTask.id, { title: newTask.title });
    setNewQuickTitle('');
    setNewQuickCompleted(false);
    setAddingQuickRow(false);
  };

  /** 从迷你今日写入有可选起止时间的任务，并复用完整工作台的持久化字段。 */
  const createCompactTimedTask = (draft: CompactTimedTaskDraft) => {
    const task: Task = {
      id: crypto.randomUUID(),
      projectId: draft.projectId,
      title: draft.title,
      date: selectedDate,
      plannedStartTime: draft.start,
      plannedEndTime: draft.end,
      plannedDurationMinutes:
        draft.start && draft.end
          ? calculateDuration(draft.start, draft.end)
          : undefined,
      schedulePendingTime: !draft.start,
      completed: false,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateTasks((current) => [...current, task]);
    appendHistory('created', task.id, { title: task.title });
  };

  /** 从迷你今日写入无时间待办，不额外推断时间或完成状态。 */
  const createCompactQuickTask = (draft: CompactQuickTaskDraft) => {
    const task: Task = {
      id: crypto.randomUUID(),
      projectId: draft.projectId,
      title: draft.title,
      date: selectedDate,
      completed: false,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateTasks((current) => [...current, task]);
    appendHistory('created', task.id, { title: task.title });
  };

  const startResizeSchedule = (e: React.PointerEvent) => {
    setIsResizingSchedule(true);
    resizeStartXRef.current = e.clientX;
    resizeStartRatioRef.current = scheduleRatio;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - resizeStartXRef.current;
      // 向右拖动 deltaX > 0，增加比例
      const deltaRatio = deltaX / 260;
      const nextRatio = Math.max(
        1.1,
        Math.min(3.2, resizeStartRatioRef.current + deltaRatio),
      );
      setScheduleRatio(nextRatio);
    };

    const onPointerUp = () => {
      setIsResizingSchedule(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };
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

  if (!hydrated)
    return (
      <Surface className="workspace-loading">
        <p>正在载入工作台…</p>
      </Surface>
    );
  const shown = tasks.filter((t) => t.status === 'active' && t.date === selectedDate);
  const movedFromSelectedDate = tasks.filter(
    (task) =>
      task.status === 'active' &&
      task.date !== selectedDate &&
      task.postponedFrom === selectedDate,
  );
  const daily =
    dailyByDate[selectedDate] ?? createDailyInstance(selectedDate, dailyTemplates);
  const tomorrow = addLocalDateDays(selectedDate, 1);
  const timed = shown
    .filter((t) => Boolean(t.plannedStartTime) || t.schedulePendingTime)
    .sort((a, b) => {
      if (a.schedulePendingTime !== b.schedulePendingTime) {
        return a.schedulePendingTime ? -1 : 1;
      }
      if (a.plannedStartTime && b.plannedStartTime) {
        return a.plannedStartTime.localeCompare(b.plannedStartTime);
      }
      if (a.plannedStartTime) return -1;
      if (b.plannedStartTime) return 1;
      return 0;
    });
  const quick = shown.filter((t) => !t.plannedStartTime && !t.schedulePendingTime);
  const backlog = tasks.filter((t) => t.status === 'backlog');
  const done = shown.filter((t) => t.completed).length;
  const normalTaskTotal = shown.length + movedFromSelectedDate.length;
  const actual = shown.reduce((sum, t) => sum + (t.actualDurationMinutes ?? 0), 0);
  const dailyActual = daily.reduce((sum, item) => sum + item.actual, 0);
  const dailyDone = daily.filter(
    (item) => item.completed || item.children.some((child) => child.completed),
  ).length;
  const isDayClosed = closeRecords.some((record) => record.date === selectedDate);
  const annotationInteractionLocked = annotationTool !== 'none';

  const toggleAnnotationTool = (tool: AnnotationTool) => {
    setAnnotationTool((current) => (current === tool ? 'none' : tool));
  };

  const update = (task: Task) =>
    updateTasks((current) =>
      current.map((item) => (item.id === task.id ? task : item)),
    );

  /** 只组合当前领域状态；Calendar、Insights 与 PDF 都由各自的纯 selector 消费该输入。 */
  const analyticsInput = {
    tasks,
    projects: workspaceProjects,
    dailyByDate,
    dailyHistory,
    closeRecords,
  };

  /** 切换任务在工作站内的引用，不触碰原任务、日期、完成状态或优先级。 */
  const toggleWorkstationTask = (taskId: string) =>
    updateWorkstationTaskIds((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    );

  /** 清空工作站仅清空引用集合，绝不删除或变更任务记录。 */
  const clearWorkstation = () => updateWorkstationTaskIds([]);

  /** 调整引用集合顺序；Task 本身的 priority 和字段完全保持不变。 */
  const reorderWorkstation = (sourceId: string, targetId: string) =>
    updateWorkstationTaskIds((current) => {
      const sourceIndex = current.indexOf(sourceId);
      const targetIndex = current.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex)
        return current;
      const next = [...current];
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, sourceId);
      return next;
    });

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
  const handleTaskDragStart = (taskId: string) => {
    if (annotationInteractionLocked) return;
    draggingTaskIdRef.current = taskId;
    setDraggingTaskId(taskId);
  };

  /**
   * 无论任务是否落入有效区域，都清理本次原生拖拽的临时视觉状态。
   */
  const handleTaskDragEnd = () => {
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
    setDropTarget(null);
  };

  /**
   * 从标准或自定义拖拽载荷读取任务 ID，并兼容 WebView 未回传载荷的情况。
   */
  const getDraggedTaskId = (event: React.DragEvent) =>
    event.dataTransfer.getData('text/task-id') ||
    event.dataTransfer.getData('text/plain') ||
    draggingTaskIdRef.current;

  /**
   * 从当前鼠标坐标识别任务可落入的面板，供 Windows WebView2 的 Pointer Events 拖拽使用。
   */
  const getDropZoneAtPoint = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    const zone = element?.closest<HTMLElement>('[data-task-drop-zone]')?.dataset
      .taskDropZone;
    return zone === 'schedule' || zone === 'quick' ? zone : null;
  };

  /** 从 React PointerEvent 读取最终屏幕坐标，统一交给按点命中的落点解析器。 */
  const getDropZoneAtPointer = (event: React.PointerEvent) =>
    getDropZoneAtPoint(event.clientX, event.clientY);

  /** 完成一次明确拖拽柄的移动；命中面板后只改变任务排程状态。 */
  const finishPointerDrag = (pointerId: number, clientX: number, clientY: number) => {
    const activePointerDrag = pointerDragRef.current;
    const fallbackTaskId = draggingTaskIdRef.current;
    const taskId = activePointerDrag?.taskId ?? fallbackTaskId;
    if (!taskId || (activePointerDrag && pointerId !== activePointerDrag.pointerId))
      return;
    const target = getDropZoneAtPoint(clientX, clientY);
    if (target === 'schedule') moveTaskToSchedule(taskId);
    if (target === 'quick') moveTaskToQuick(taskId);
    pointerDragRef.current = undefined;
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
    setDropTarget(null);
  };

  /**
   * 从明确的六点拖拽柄开始桌面鼠标拖拽，避免依赖 WebView2 不稳定的原生 draggable 事件。
   */
  const handlePointerDragStart = (
    taskId: string,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (
      annotationInteractionLocked ||
      event.pointerType !== 'mouse' ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextPointerDrag = { taskId, pointerId: event.pointerId };
    pointerDragRef.current = nextPointerDrag;
    draggingTaskIdRef.current = taskId;
    setDraggingTaskId(taskId);

    /** 在滚动容器接管事件时，仍从窗口捕获阶段完成本次拖拽。 */
    const finishFromWindow = (nativeEvent: PointerEvent) => {
      finishPointerDrag(
        nativeEvent.pointerId,
        nativeEvent.clientX,
        nativeEvent.clientY,
      );
      window.removeEventListener('pointerup', finishFromWindow, true);
    };
    window.addEventListener('pointerup', finishFromWindow, true);
  };

  /**
   * 随鼠标移动高亮当前有效的落点面板。
   */
  const handlePointerDragMove = (event: React.PointerEvent) => {
    const activePointerDrag = pointerDragRef.current;
    if (!activePointerDrag || event.pointerId !== activePointerDrag.pointerId) return;
    const nextTarget = getDropZoneAtPointer(event);
    setDropTarget((current) => (current === nextTarget ? current : nextTarget));
  };

  /**
   * 松开鼠标后按落点移动原任务；没有有效落点时只清理临时拖拽状态。
   */
  const handlePointerDragEnd = (event: React.PointerEvent) => {
    finishPointerDrag(event.pointerId, event.clientX, event.clientY);
  };

  /**
   * 允许非批注状态下的任务落入日程面板；preventDefault 是浏览器接受 drop 的前提。
   */
  const handleScheduleDragOver = (event: React.DragEvent) => {
    if (annotationInteractionLocked) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget('schedule');
  };

  /**
   * 将同一条无时间任务持久化为待填时间状态，并将时间输入聚焦给用户。
   */
  const handleScheduleDrop = (event: React.DragEvent) => {
    if (annotationInteractionLocked) return;
    event.preventDefault();
    setDropTarget(null);
    const taskId = getDraggedTaskId(event);
    if (!taskId) return;
    moveTaskToSchedule(taskId);
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
  };

  /**
   * 允许非批注状态下的任务落入无时间待办面板；preventDefault 保证 drop 可触发。
   */
  const handleQuickDragOver = (event: React.DragEvent) => {
    if (annotationInteractionLocked) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget('quick');
  };

  /**
   * 取消任务的待填或已填写排程时间，但保留任务身份与其他业务字段。
   */
  const handleQuickDrop = (event: React.DragEvent) => {
    if (annotationInteractionLocked) return;
    event.preventDefault();
    setDropTarget(null);
    const taskId = getDraggedTaskId(event);
    if (!taskId) return;
    moveTaskToQuick(taskId);
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
  };

  const open = (task?: Task, mode: 'normal' | 'unscheduled' = 'normal') => {
    setEditing(task);
    setTaskDialogMode(mode);
    setTaskDialogOpen(true);
  };
  const save = (form: FormData): string | undefined => {
    const title = String(form.get('title') ?? '').trim();
    const startRaw = String(form.get('start') ?? '');
    const endRaw = String(form.get('end') ?? '');
    const start = startRaw ? normalizeTime(startRaw) : undefined;
    const end = endRaw ? normalizeTime(endRaw) : undefined;
    const parsed = taskFormSchema.safeParse({
      title,
      projectId: String(form.get('project') ?? ''),
      plannedMinutes: numberOrUndefined(form.get('planned')),
      actualMinutes: numberOrUndefined(form.get('actual')),
    });
    if (!parsed.success) return parsed.error.issues[0]?.message ?? '请检查任务信息';
    if (startRaw && !start) return '开始时间格式应为 1420 或 14:20';
    if (endRaw && !end) return '结束时间格式应为 1530 或 15:30';
    if (end && !start) return '填写结束时间前，请先填写开始时间';
    if (end && start && end < start) return '暂不支持跨午夜任务，请选择同一天内的时间';
    const automatic = calculateDuration(start, end);
    const planned = automatic ?? numberOrUndefined(form.get('planned'));
    const base =
      editing ??
      makeTask(
        getLocalDateKey(),
        crypto.randomUUID(),
        String(form.get('project')),
        title,
      );
    update({
      ...base,
      title,
      projectId: String(form.get('project')),
      date: editing?.date ?? selectedDate,
      plannedStartTime: start,
      plannedEndTime: end,
      plannedDurationMinutes: planned,
      actualDurationMinutes: numberOrUndefined(form.get('actual')),
      updatedAt: new Date().toISOString(),
    });
    if (!editing)
      updateTasks((current) => [
        ...current,
        {
          ...base,
          title,
          projectId: String(form.get('project')),
          date: selectedDate,
          plannedStartTime: start,
          plannedEndTime: end,
          plannedDurationMinutes: planned,
          actualDurationMinutes: numberOrUndefined(form.get('actual')),
          updatedAt: new Date().toISOString(),
        },
      ]);
    setTaskDialogOpen(false);
    return undefined;
  };
  const appendHistory = (
    type: string,
    taskId?: string,
    payload: Record<string, string> = {},
  ) =>
    updateHistory((current) => [
      {
        id: crypto.randomUUID(),
        taskId,
        type,
        occurredAt: new Date().toISOString(),
        payload,
      },
      ...current,
    ]);
  const move = (id: string, status: TaskStatus) => {
    const task = tasks.find((item) => item.id === id);
    if (!task || !canTransitionTask(task, status)) return;
    if (status === 'trashed') {
      updateAnnotationStrokes((current) =>
        current.filter((stroke) => stroke.targetTaskId !== id),
      );
      updateWorkstationTaskIds((current) => current.filter((taskId) => taskId !== id));
    }
    updateTasks((current) =>
      current.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              date: status === 'active' ? t.date : undefined,
              postponedFrom:
                status !== 'active' ? (t.date ?? t.postponedFrom) : t.postponedFrom,
              abandonedAt:
                status === 'abandoned' ? new Date().toISOString() : t.abandonedAt,
              deletedAt: status === 'trashed' ? new Date().toISOString() : t.deletedAt,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    );
    appendHistory(status, id, { fromDate: task?.date ?? selectedDate });
  };
  const reschedule = (targetDate: string) => {
    if (!rescheduling) return;
    if (!canTransitionTask(rescheduling, 'rescheduled')) return '请先取消完成再移期';
    const sourceDate = rescheduling.date ?? selectedDate;
    if (targetDate <= sourceDate) return '请选择晚于原计划日期的未来日期';
    updateTasks((current) =>
      current.map((task) =>
        task.id === rescheduling.id
          ? {
              ...task,
              status: 'active',
              date: targetDate,
              completed: false,
              completedAt: undefined,
              postponedFrom: sourceDate,
              postponedTo: targetDate,
              updatedAt: new Date().toISOString(),
            }
          : task,
      ),
    );
    appendHistory('rescheduled', rescheduling.id, {
      fromDate: sourceDate,
      toDate: targetDate,
    });
    setRescheduling(undefined);
    return undefined;
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
        <Surface
          className={`schedule-panel${dropTarget === 'schedule' ? 'is-drop-target' : ''}`}
          data-task-drop-zone="schedule"
          onDragOver={handleScheduleDragOver}
          onDragLeave={() => setDropTarget(null)}
          onDrop={handleScheduleDrop}
        >
          <header className="schedule-panel-header">
            <h2>今日日程</h2>
            <div className="schedule-panel-actions">
              <div className="annotation-tools" role="group" aria-label="批注工具">
                <button
                  type="button"
                  className={`annotation-tool-btn${annotationTool === 'none' ? 'is-active' : ''}`}
                  aria-label="选择模式"
                  title="选择模式"
                  onClick={() => setAnnotationTool('none')}
                >
                  <MousePointer2 size={15} />
                </button>
                <AnnotationColorPicker
                  active={annotationTool === 'highlight'}
                  color={highlightColor}
                  onActivate={() => setAnnotationTool('highlight')}
                  onColorChange={updateHighlightColor}
                />
                <button
                  type="button"
                  className={`annotation-tool-btn${annotationTool === 'eraser' ? 'is-active' : ''}`}
                  aria-label="橡皮擦"
                  title="橡皮擦（Esc 退出）"
                  onClick={() => toggleAnnotationTool('eraser')}
                >
                  <Eraser size={15} />
                </button>
              </div>
              <button
                className="add-link"
                onClick={() => {
                  setAddingTimedRow(true);
                  setNewTimedProjectId(workspaceProjects[0]?.id ?? 'work');
                }}
              >
                <Plus size={19} /> 添加
              </button>
              {!isMiniToday && (
                <button
                  type="button"
                  className={`schedule-resize-handle ${isResizingSchedule ? 'is-resizing' : ''}`}
                  onPointerDown={startResizeSchedule}
                  title="按住向右拖动以扩展今日日程宽度"
                >
                  <GripVertical size={16} />
                </button>
              )}
            </div>
          </header>
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
        </Surface>
        {!isMiniToday && (
          <div className="side-column">
            <Surface
              className={`quick-panel${dropTarget === 'quick' ? 'is-drop-target' : ''}`}
              data-task-drop-zone="quick"
              onDragOver={handleQuickDragOver}
              onDragLeave={() => setDropTarget(null)}
              onDrop={handleQuickDrop}
            >
              <header>
                <h2>无时间待办</h2>
                <button
                  className="add-link"
                  onClick={() => {
                    setAddingQuickRow(true);
                    setNewQuickProjectId(workspaceProjects[0]?.id ?? 'other');
                  }}
                >
                  <Plus size={19} /> 添加
                </button>
              </header>
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
            </Surface>
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

function numberOrUndefined(value: FormDataEntryValue | null) {
  return value === null || value === '' ? undefined : Number(value);
}

