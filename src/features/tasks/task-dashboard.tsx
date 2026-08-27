/**
 * @fileoverview 任务工作台组件，提供仪表盘、任务列表、今日日程和弹窗交互。
 */

'use client';

import { Check, Eraser, GripVertical, Highlighter, MoreHorizontal, MousePointer2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { AnnotationLayer, type AnnotationTool } from '@/components/annotation-layer';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ProjectTag } from '@/components/ui/project-tag';
import { StatItem } from '@/components/ui/stat-item';
import { Surface } from '@/components/ui/surface';
import { calculateDuration } from '@/lib/task-rules';
import { taskFormSchema } from '@/lib/schemas';
import {
  DailyPanel,
  seedDaily,
  type Daily,
  type DailyHistoryEntry,
} from '@/features/daily/daily-panel';
import { ProjectPanel } from '@/features/projects/project-panel';
import { ReviewPanel } from '@/features/reviews/review-panel';
import { HistoryPanel } from '@/features/history/history-panel';
import { SettingsPanel } from '@/features/settings/settings-panel';
import { StatsPanel } from '@/features/stats/stats-panel';
import { useWorkspaceView } from '@/components/app-shell';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { useAnnotationStrokes } from '@/hooks/use-annotation-strokes';
import { addLocalDateDays, getLocalDateKey } from '@/lib/local-date';
import { MiniTodayPanel, WorkstationPanel } from '@/features/tasks/compact-workspace';
import type { CloseRecord, HistoryEvent, Project, Task, TaskStatus } from '@/types/domain';

type TaskDropZone = 'schedule' | 'quick';
/** 创建首次打开工作台时可编辑的内置项目，并把创建日绑定到用户本地日期。 */
function createProjectSeed(today = getLocalDateKey()): Project[] {
  return [
    { id: 'work', name: '工作', color: '#4f8cff', status: 'active', createdAt: today },
    { id: 'course', name: '课程', color: '#8b7cf6', status: 'active', createdAt: today },
    { id: 'research', name: 'AI研究', color: '#38a774', status: 'active', createdAt: today },
    { id: 'life', name: '生活', color: '#e9a04b', status: 'active', createdAt: today },
    { id: 'other', name: '其他', color: '#8793a7', status: 'active', createdAt: today },
  ];
}
/** 创建首次打开时的演示任务，使任务的业务日期和元数据始终属于本地当天。 */
function createInitialTasks(today = getLocalDateKey()): Task[] {
  return [
    makeTask(today, 'email', 'work', '邮件处理', '08:30', undefined, 40),
    makeTask(today, 'stats', 'course', '统计课预习', '10:45', undefined, 60),
    makeTask(today, 'paper', 'course', '领域论文', '12:00', '13:30', 90, 56, true),
    makeTask(today, 'demo', 'research', '跑 Demo', '14:20', undefined, 45),
    makeTask(today, 'meeting', 'work', '会议记录', '15:10', '16:10', 60, 58, true),
    makeTask(today, 'gym', 'life', '健身', '17:00', undefined, 60),
    makeTask(today, 'adapter', 'other', '买转换插头'),
    makeTask(today, 'pickup', 'life', '取快递'),
  ];
}
/** 创建一条内置任务，并让业务日期和 created/updated 元数据保持同一日期语义。 */
function makeTask(
  today: string,
  id: string,
  projectId: string,
  title: string,
  plannedStartTime?: string,
  plannedEndTime?: string,
  plannedDurationMinutes?: number,
  actualDurationMinutes?: number,
  completed = false,
): Task {
  return {
    id,
    projectId,
    title,
    date: today,
    plannedStartTime,
    plannedEndTime,
    plannedDurationMinutes,
    actualDurationMinutes,
    completed,
    status: 'active',
    createdAt: today,
    updatedAt: today,
  };
}
function formatMinutes(value?: number) {
  if (value === undefined) return '—';
  return value < 60
    ? `${value}min`
    : `${Math.floor(value / 60)}h${value % 60 ? `${value % 60}min` : ''}`;
}

/**
 * 解析用户输入的持续时间字符串（如 30, 30min, 1h, 1.5h, 1h20min, —）。
 */
function parseDurationInput(value: string): number | undefined {
  const clean = value.trim().toLowerCase();
  if (!clean || clean === '—' || clean === '-' || clean === '0' || clean === '0min') {
    return undefined;
  }
  const hourMinMatch = clean.match(
    /^(\d+(?:\.\d+)?)\s*h(?:our)?s?\s*(\d+)?(?:\s*m(?:in)?s?)?$/,
  );
  if (hourMinMatch) {
    const hours = parseFloat(hourMinMatch[1]);
    const mins = hourMinMatch[2] ? parseInt(hourMinMatch[2], 10) : 0;
    return Math.round(hours * 60 + mins);
  }
  const minMatch = clean.match(/^(\d+)\s*(?:m|min|mins|minute|minutes)?$/);
  if (minMatch) {
    return parseInt(minMatch[1], 10);
  }
  return undefined;
}

/**
 * 解析用户输入的时间范围（如 08:30, 0830, 08:30-10:00, 15:10–16:10, 1510-1610）。
 */
function parseTimeInput(value: string): { start?: string; end?: string; duration?: number } {
  const clean = value.trim();
  if (!clean) return {};
  const parts = clean.split(/[-–~至到\s]+/).filter(Boolean);
  if (parts.length === 1) {
    const start = normalizeTime(parts[0]);
    return { start };
  }
  if (parts.length >= 2) {
    const start = normalizeTime(parts[0]);
    const end = normalizeTime(parts[1]);
    if (start && end && end >= start) {
      const duration = calculateDuration(start, end);
      return { start, end, duration };
    }
    return { start, end };
  }
  return {};
}
function normalizeTime(value: string) {
  const clean = value.trim();
  const parsed = /^\d{3,4}$/.test(clean)
    ? `${clean.slice(0, -2)}:${clean.slice(-2)}`
    : clean;
  if (!/^\d{1,2}:\d{2}$/.test(parsed)) return undefined;
  const [h, m] = parsed.split(':').map(Number);
  return h < 24 && m < 60
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    : undefined;
}
function isTrashExpired(task: Task) {
  return (
    task.status === 'trashed' &&
    Boolean(task.deletedAt) &&
    new Date(task.deletedAt!).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000
  );
}
const withoutExpiredTasks = (items: Task[]) =>
  items.filter((task) => !isTrashExpired(task));
/** 为选中日期生成 Daily 实例；当天保留模板演示状态，其他日期从未完成状态开始。 */
function createDailyInstance(date: string, templates: Daily[]): Daily[] {
  if (date === getLocalDateKey()) return structuredClone(templates);
  return templates.map((item) => ({
    ...item,
    actual: 0,
    result: '',
    completed: false,
    children: item.children.map((child) => ({ ...child, actual: 0, completed: false })),
  }));
}

export function TaskDashboard() {
  const { active, selectedDate } = useWorkspaceView();
  const { isMiniToday, isWorkstation } = useDesktopWindow();
  const [tasks, setTasks, tasksHydrated] = usePersistentState(
    'threadline.tasks.v1',
    () => withoutExpiredTasks(createInitialTasks()),
    withoutExpiredTasks,
  );
  const [workspaceProjects, setWorkspaceProjects, projectsHydrated] = usePersistentState(
    'threadline.projects.v1',
    createProjectSeed,
  );
  const [dailyByDate, setDailyByDate, dailyByDateHydrated] = usePersistentState<
    Record<string, Daily[]>
  >(
    'threadline.daily-by-date.v1',
    () => ({ [getLocalDateKey()]: seedDaily }),
  );
  const [dailyTemplates, setDailyTemplates, dailyTemplatesHydrated] = usePersistentState<
    Daily[]
  >(
    'threadline.daily-templates.v1',
    seedDaily,
  );
  const [dailyHistory, setDailyHistory, dailyHistoryHydrated] = usePersistentState<
    DailyHistoryEntry[]
  >(
    'threadline.daily-history.v1',
    [],
  );
  const [history, setHistory, historyHydrated] = usePersistentState<HistoryEvent[]>(
    'threadline.history.v1',
    [],
  );
  const [closeRecords, setCloseRecords, closeRecordsHydrated] = usePersistentState<
    CloseRecord[]
  >(
    'threadline.close-records.v1',
    [],
  );
  const [annotationStrokes, setAnnotationStrokes, annotationHydrated] = useAnnotationStrokes();
  const [workstationTaskIds, setWorkstationTaskIds, workstationHydrated] = usePersistentState<string[]>(
    'threadline.workstation.v1',
    [],
    (value) => Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string'))] : [],
  );
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('none');
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const draggingTaskIdRef = useRef<string | null>(null);
  const [pointerDrag, setPointerDrag] = useState<
    { taskId: string; pointerId: number } | undefined
  >();
  const [dropTarget, setDropTarget] = useState<TaskDropZone | null>(null);
  const [autoFocusTimeTaskId, setAutoFocusTimeTaskId] = useState<string | null>(null);

  const [addingTimedRow, setAddingTimedRow] = useState(false);
  const [newTimedTime, setNewTimedTime] = useState('');
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

  const [scheduleRatio, setScheduleRatio] = useState<number>(1.45);
  const [isResizingSchedule, setIsResizingSchedule] = useState(false);
  const resizeStartXRef = useRef<number>(0);
  const resizeStartRatioRef = useRef<number>(1.45);

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
    setWorkspaceProjects((current) => [...current, newProj]);
    return newProj;
  };

  const handleConfirmAddTimed = () => {
    if (!newTimedTitle.trim()) {
      setAddingTimedRow(false);
      return;
    }
    const { start, end, duration } = parseTimeInput(newTimedTime);
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
    setTasks((current) => [...current, newTask]);
    appendHistory('created', newTask.id, { title: newTask.title });
    setNewTimedTime('');
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
    setTasks((current) => [...current, newTask]);
    appendHistory('created', newTask.id, { title: newTask.title });
    setNewQuickTitle('');
    setNewQuickCompleted(false);
    setAddingQuickRow(false);
  };

  const startResizeSchedule = (e: React.PointerEvent) => {
    setIsResizingSchedule(true);
    resizeStartXRef.current = e.clientX;
    resizeStartRatioRef.current = scheduleRatio;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - resizeStartXRef.current;
      // 向右拖动 deltaX > 0，增加比例
      const deltaRatio = deltaX / 260;
      const nextRatio = Math.max(1.1, Math.min(3.2, resizeStartRatioRef.current + deltaRatio));
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
  const [taskDialogMode, setTaskDialogMode] = useState<'normal' | 'unscheduled'>('normal');
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

  const hydrated =
    tasksHydrated &&
    projectsHydrated &&
    dailyByDateHydrated &&
    dailyTemplatesHydrated &&
    dailyHistoryHydrated &&
    historyHydrated &&
    closeRecordsHydrated &&
    annotationHydrated &&
    workstationHydrated;
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
    .filter(
      (t) => Boolean(t.plannedStartTime) || t.schedulePendingTime,
    )
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
  const quick = shown.filter(
    (t) => !t.plannedStartTime && !t.schedulePendingTime,
  );
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
    setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));

  /** 切换任务在工作站内的引用，不触碰原任务、日期、完成状态或优先级。 */
  const toggleWorkstationTask = (taskId: string) =>
    setWorkstationTaskIds((current) => current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]);

  /** 清空工作站仅清空引用集合，绝不删除或变更任务记录。 */
  const clearWorkstation = () => setWorkstationTaskIds([]);

  /** 调整引用集合顺序；Task 本身的 priority 和字段完全保持不变。 */
  const reorderWorkstation = (sourceId: string, targetId: string) => setWorkstationTaskIds((current) => {
    const sourceIndex = current.indexOf(sourceId); const targetIndex = current.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;
    const next = [...current]; next.splice(sourceIndex, 1); next.splice(targetIndex, 0, sourceId); return next;
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
  const getDropZoneAtPointer = (event: React.PointerEvent) => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const zone = element?.closest<HTMLElement>('[data-task-drop-zone]')?.dataset.taskDropZone;
    return zone === 'schedule' || zone === 'quick' ? zone : null;
  };

  /**
   * 从明确的六点拖拽柄开始桌面鼠标拖拽，避免依赖 WebView2 不稳定的原生 draggable 事件。
   */
  const handlePointerDragStart = (
    taskId: string,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (annotationInteractionLocked || event.pointerType !== 'mouse' || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPointerDrag({ taskId, pointerId: event.pointerId });
    setDraggingTaskId(taskId);
  };

  /**
   * 随鼠标移动高亮当前有效的落点面板。
   */
  const handlePointerDragMove = (event: React.PointerEvent) => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    const nextTarget = getDropZoneAtPointer(event);
    setDropTarget((current) => (current === nextTarget ? current : nextTarget));
  };

  /**
   * 松开鼠标后按落点移动原任务；没有有效落点时只清理临时拖拽状态。
   */
  const handlePointerDragEnd = (event: React.PointerEvent) => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    const target = getDropZoneAtPointer(event);
    if (target === 'schedule') moveTaskToSchedule(pointerDrag.taskId);
    if (target === 'quick') moveTaskToQuick(pointerDrag.taskId);
    setPointerDrag(undefined);
    setDraggingTaskId(null);
    setDropTarget(null);
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
      editing ?? makeTask(getLocalDateKey(), crypto.randomUUID(), String(form.get('project')), title);
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
      setTasks((current) => [
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
    setHistory((current) => [
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
    if (status === 'trashed') {
      setAnnotationStrokes((current) =>
        current.filter((stroke) => stroke.targetTaskId !== id),
      );
      setWorkstationTaskIds((current) => current.filter((taskId) => taskId !== id));
    }
    setTasks((current) =>
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
    const sourceDate = rescheduling.date ?? selectedDate;
    if (targetDate <= sourceDate) return '请选择晚于原计划日期的未来日期';
    setTasks((current) =>
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
    return <MiniTodayPanel timed={timed} quick={quick} projects={workspaceProjects} workstationTaskIds={workstationTaskIds} onUpdateTask={update} onToggleWorkstation={toggleWorkstationTask} onClearWorkstation={clearWorkstation} onReorderWorkstation={reorderWorkstation} />;
  if (isWorkstation)
    return <WorkstationPanel tasks={tasks.filter((task) => task.status !== 'trashed')} projects={workspaceProjects} workstationTaskIds={workstationTaskIds} onToggleWorkstation={toggleWorkstationTask} onClearWorkstation={clearWorkstation} onReorderWorkstation={reorderWorkstation} />;
  if (active === 'projects')
    return (
      <ProjectPanel
        items={workspaceProjects}
        tasks={tasks}
        daily={daily}
        dailyHistory={dailyHistory}
        onChange={setWorkspaceProjects}
      />
    );
  if (active === 'stats')
    return (
      <StatsPanel
        tasks={tasks}
        projects={workspaceProjects}
        daily={daily}
        dailyHistory={dailyHistory}
        selectedDate={selectedDate}
      />
    );
  if (active === 'review')
    return (
      <ReviewPanel
        tasks={tasks}
        projects={workspaceProjects}
        daily={daily}
        dailyHistory={dailyHistory}
        history={history}
        closeRecords={closeRecords}
        selectedDate={selectedDate}
      />
    );
  if (active === 'settings')
    return (
      <SettingsPanel
        historyContent={
          <HistoryPanel
            tasks={tasks}
            history={history}
            closeRecords={closeRecords}
            dailyHistory={dailyHistory}
            onUpdate={update}
          />
        }
      />
    );
  const isSchedulePage = active === 'schedule';
  return (
    <div className={`dashboard dashboard-annotatable${isSchedulePage ? ' schedule-workspace' : ''}`} data-testid={isSchedulePage ? 'schedule-panel' : 'home-panel'}>
      {isSchedulePage && !isMiniToday && (
        <div className="schedule-workspace-intro">
          <span>今日安排</span>
          <p>待填时间任务固定在最上方；拖动任务可在日程和无时间待办之间移动。</p>
        </div>
      )}
      {!isMiniToday && !isSchedulePage && (
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
        className={`dashboard-columns${isMiniToday ? ' is-mini-today' : ''}`}
        style={{ '--schedule-ratio': `${scheduleRatio}fr` } as React.CSSProperties}
        onPointerMove={handlePointerDragMove}
        onPointerUp={handlePointerDragEnd}
        onPointerCancel={handlePointerDragEnd}
      >
        <Surface
          className={`schedule-panel${dropTarget === 'schedule' ? ' is-drop-target' : ''}`}
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
                  className={`annotation-tool-btn${annotationTool === 'none' ? ' is-active' : ''}`}
                  aria-label="选择模式"
                  title="选择模式"
                  onClick={() => setAnnotationTool('none')}
                >
                  <MousePointer2 size={15} />
                </button>
                <button
                  type="button"
                  className={`annotation-tool-btn${annotationTool === 'highlight' ? ' is-active' : ''}`}
                  aria-label="荧光笔"
                  title="荧光笔（Esc 退出）"
                  onClick={() => toggleAnnotationTool('highlight')}
                >
                  <Highlighter size={15} />
                </button>
                <button
                  type="button"
                  className={`annotation-tool-btn${annotationTool === 'eraser' ? ' is-active' : ''}`}
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
          <div className="timeline-head">
            <span className="timeline-col-time">时间</span>
            <span className="timeline-col-check"></span>
            <span className="timeline-col-project">项目</span>
            <span className="timeline-col-title">任务</span>
            <span className="timeline-col-planned">预计</span>
            <span className="timeline-col-actual">实际</span>
            <span className="timeline-col-actions"></span>
            <span className="timeline-col-drag"></span>
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
              inWorkstation={workstationTaskIds.includes(task.id)}
              onToggleWorkstation={toggleWorkstationTask}
              inSchedulePanel
            />
          ))}

          {addingTimedRow && (
            <div className="timeline-row timeline-row-adding">
              <input
                className="tl-inline-input timeline-time-input"
                placeholder="08:30"
                value={newTimedTime}
                autoFocus
                onChange={(e) => setNewTimedTime(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmAddTimed();
                  if (e.key === 'Escape') setAddingTimedRow(false);
                }}
              />
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
                              const created = createProjectDirectly(newTimedProjectName.trim());
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
                            const created = createProjectDirectly(newTimedProjectName.trim());
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
        </Surface>
        {!isMiniToday && !isSchedulePage && (
        <div className="side-column">
          <Surface
            className={`quick-panel${dropTarget === 'quick' ? ' is-drop-target' : ''}`}
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
                    onPointerDragStart={(event) => handlePointerDragStart(task.id, event)}
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
                                  const created = createProjectDirectly(newQuickProjectName.trim());
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
                                const created = createProjectDirectly(newQuickProjectName.trim());
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
              setDailyByDate((current) => ({ ...current, [selectedDate]: items }))
            }
            onAdd={(item) => {
              setDailyTemplates((current) => [...current, item]);
              setDailyByDate((current) => {
                const existing =
                  current[selectedDate] ??
                  createDailyInstance(selectedDate, dailyTemplates);
                return { ...current, [selectedDate]: [...existing, item] };
              });
            }}
            onRecord={(entry) => setDailyHistory((current) => [entry, ...current])}
          />
        </div>
        )}
      </div>
      {!isMiniToday && !isSchedulePage && (
      <PlanningQueue
        tasks={backlog}
        projects={workspaceProjects}
        onUpdate={update}
        onMove={move}
        onArrange={(id) => {
          setTasks((current) =>
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
      {!isMiniToday && !isSchedulePage && (
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
        strokes={annotationStrokes}
        onChangeStrokes={setAnnotationStrokes}
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
          setTasks((current) =>
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
          setHistory((current) => [...events, ...current]);
          setDailyHistory((current) => [
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
          setCloseRecords((current) => [
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
function CloseDialog({
  dialog,
  tasks,
  actual,
  dailyDone,
  dailyCount,
  dailyActual,
  tomorrow,
  onCloseDay,
}: {
  dialog: React.RefObject<HTMLDialogElement | null>;
  tasks: Task[];
  actual: number;
  dailyDone: number;
  dailyCount: number;
  dailyActual: number;
  tomorrow: string;
  onCloseDay: (data: FormData) => void;
}) {
  const unfinished = tasks.filter((task) => !task.completed);
  return (
    <dialog className="task-dialog close-dialog" ref={dialog}>
      <form action={onCloseDay}>
        <header>
          <div>
            <p>每日收尾</p>
            <h2>结束今天</h2>
          </div>
          <button formMethod="dialog" aria-label="关闭">
            ×
          </button>
        </header>
        <div className="close-metrics">
          <span>
            普通任务{' '}
            <b>
              {tasks.filter((task) => task.completed).length}/{tasks.length}
            </b>
          </span>
          <span>
            Daily{' '}
            <b>
              {dailyDone}/{dailyCount}
            </b>
          </span>
          <span>
            普通实际 <b>{formatMinutes(actual)}</b>
          </span>
          <span>
            Daily 实际 <b>{formatMinutes(dailyActual)}</b>
          </span>
          <span>
            今日总实际 <b>{formatMinutes(actual + dailyActual)}</b>
          </span>
        </div>
        <h3>未完成普通任务</h3>
        {unfinished.length === 0 ? (
          <p>所有普通任务均已完成。</p>
        ) : (
          unfinished.map((task) => (
            <div className="close-task" key={task.id}>
              <b>{task.title}</b>
              <select name={`action-${task.id}`} defaultValue="tomorrow">
                <option value="tomorrow">移到明天</option>
                <option value="date">选择日期</option>
                <option value="backlog">待安排</option>
                <option value="abandoned">放弃</option>
              </select>
              <Input name={`date-${task.id}`} type="date" defaultValue={tomorrow} />
            </div>
          ))
        )}
        <p>未完成 Daily 只记录为今日未完成，不会顺延。</p>
        <footer>
          <button formMethod="dialog">稍后处理</button>
          <button type="submit">确认结束今天</button>
        </footer>
      </form>
    </dialog>
  );
}
function PlanningQueue({
  tasks,
  projects,
  onUpdate,
  onMove,
  onArrange,
}: {
  tasks: Task[];
  projects: Project[];
  onUpdate: (task: Task) => void;
  onMove: (id: string, status: TaskStatus) => void;
  onArrange: (id: string) => void;
}) {
  return (
    <Surface className="planning-queue">
      <header>
        <h2>待安排</h2>
        <span>重要 / 不重要 · DDL 可选</span>
      </header>
      {tasks.length === 0 ? (
        <p>还没有待安排事项。任务选择“待安排”后会出现在这里。</p>
      ) : (
        tasks.map((task) => {
          const project =
            projects.find((item) => item.id === task.projectId) ?? createProjectSeed()[4];
          return (
            <div className="queue-row" key={task.id}>
              <ProjectTag name={project.name} color={project.color} />
              <b>{task.title}</b>
              <select
                aria-label={`${task.title}重要性`}
                value={task.backlogImportance ?? 'important'}
                onChange={(event) =>
                  onUpdate({
                    ...task,
                    backlogImportance: event.target.value as
                      'important' | 'not_important',
                  })
                }
              >
                <option value="important">重要</option>
                <option value="not_important">不重要</option>
              </select>
              <Input
                aria-label={`${task.title} DDL`}
                type="datetime-local"
                value={task.ddlAt ?? ''}
                onChange={(event) =>
                  onUpdate({ ...task, ddlAt: event.target.value || undefined })
                }
              />
              <button onClick={() => onArrange(task.id)}>安排到今天</button>
              <button onClick={() => onMove(task.id, 'abandoned')}>放弃</button>
              <button onClick={() => onMove(task.id, 'trashed')}>删除</button>
            </div>
          );
        })
      )}
    </Surface>
  );
}
function numberOrUndefined(value: FormDataEntryValue | null) {
  return value === null || value === '' ? undefined : Number(value);
}
/**
 * 任务单行组件（支持时间线视图、无时间待办与持久化的待填时间状态）。
 */
function TaskLine({
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
  onAddProject?: (name: string) => Project | void;
  draggable?: boolean;
  isDragging?: boolean;
  autoFocusTime?: boolean;
  onTimeFocused?: () => void;
  interactionLocked?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onPointerDragStart?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  inSchedulePanel?: boolean;
  inWorkstation?: boolean;
  onToggleWorkstation?: (taskId: string) => void;
}) {
  const project = projects.find((p) => p.id === task.projectId) ?? createProjectSeed()[4];
  const timed = inSchedulePanel || Boolean(task.plannedStartTime);
  const canDrag = draggable && !interactionLocked;
  const [editingField, setEditingField] = useState<
    'time' | 'project' | 'title' | 'planned' | 'actual' | undefined
  >();
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
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

  const handleCreateProject = () => {
    if (!newProjectName.trim() || !onAddProject) return;
    const created = onAddProject(newProjectName.trim());
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
   * 保存时间输入；空输入保留待填状态，合法开始时间则完成排程并移除待填标记。
   */
  const saveTime = (input: string) => {
    const { start, end, duration } = parseTimeInput(input);
    onUpdate({
      ...task,
      plannedStartTime: start,
      plannedEndTime: end,
      plannedDurationMinutes: duration ?? task.plannedDurationMinutes,
      schedulePendingTime: start ? false : task.schedulePendingTime,
      updatedAt: new Date().toISOString(),
    });
    setEditingField(undefined);
  };

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

  const savePlanned = (input: string) => {
    const duration = parseDurationInput(input);
    onUpdate({
      ...task,
      plannedDurationMinutes: duration,
      updatedAt: new Date().toISOString(),
    });
    setEditingField(undefined);
  };

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

  return (
    <div
      className={`${timed ? 'timeline-row' : 'quick-task-row'} task-row-draggable${task.completed ? ' completed' : ''}${isDragging ? ' is-dragging' : ''}${!canDrag ? ' is-drag-disabled' : ''}`}
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
      {timed ? (
        editingField === 'time' ? (
          <input
            className="tl-inline-input timeline-time-input"
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
        ) : (
          <time
            className={`timeline-time tl-clickable-cell${!task.plannedStartTime ? ' is-pending-time' : ''}`}
            onClick={() => !interactionLocked && setEditingField('time')}
            title="点击直接修改时间（支持 08:30 或 08:30-10:00）"
          >
            {timeDisplay || '—'}
          </time>
        )
      ) : null}

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

      <div
        className="task-project-cell"
        style={{ position: 'relative' }}
        ref={projectPickerRef}
      >
        {editingField === 'project' ? (
          <div className="project-picker-popover">
            <div className="project-picker-list">
              {projects
                .filter((p) => p.status === 'active' || p.id === task.projectId)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`project-picker-item ${p.id === task.projectId ? 'is-selected' : ''}`}
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
          <ProjectTag name={project.name} color={project.color} />
        </span>
      </div>

      {editingField === 'title' ? (
        <input
          className="tl-inline-input task-title-input"
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

      {timed && (
        <>
          {editingField === 'planned' ? (
            <input
              className="tl-inline-input task-duration-input"
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
              {formatMinutes(task.plannedDurationMinutes)}
            </span>
          )}

          {editingField === 'actual' ? (
            <input
              className="tl-inline-input task-duration-input"
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
              {formatMinutes(task.actualDurationMinutes)}
            </span>
          )}
        </>
      )}

      <div className="task-actions">
        {onToggleWorkstation && <button type="button" className={`task-workstation-action${inWorkstation ? ' is-active' : ''}`} aria-label={`${inWorkstation ? '从工作站移除' : '加入工作站'}${task.title}`} title={inWorkstation ? '从工作站移除' : '加入工作站'} onClick={() => onToggleWorkstation(task.id)}><Plus size={15} /></button>}
        <button aria-label={`${task.title}更多操作`}>
          <MoreHorizontal size={17} />
        </button>
        <div>
          <button onClick={onEdit}>
            <Pencil size={13} />
            详细编辑
          </button>
          <button onClick={onReschedule}>移期</button>
          <button onClick={() => onMove(task.id, 'backlog')}>待安排</button>
          <button onClick={() => onMove(task.id, 'abandoned')}>放弃</button>
          <button onClick={() => onMove(task.id, 'trashed')}>
            <Trash2 size={13} />
            删除
          </button>
        </div>
      </div>
      <button
        type="button"
        className="task-drag-handle"
        aria-label={`拖动${task.title}`}
        title="按住并拖到另一面板"
        disabled={!canDrag || Boolean(editingField)}
        onPointerDown={onPointerDragStart}
      >
        <GripVertical size={16} />
      </button>
    </div>
  );
}
function RescheduleDialog({
  task,
  defaultDate,
  onSave,
  onClose,
}: {
  task?: Task;
  defaultDate: string;
  onSave: (date: string) => string | undefined;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  if (!task) return null;
  return (
    <div className="task-dialog-backdrop" role="presentation">
      <form
        className="task-dialog reschedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="移期任务"
        onSubmit={(event) => {
          event.preventDefault();
          const date = String(new FormData(event.currentTarget).get('date') ?? '');
          const message = onSave(date);
          setError(message);
        }}
      >
        <header>
          <div>
            <h2>移期</h2>
            <p>{task.title}</p>
          </div>
          <button type="button" aria-label="关闭移期" onClick={onClose}>
            ×
          </button>
        </header>
        <label>
          新日期
          <Input aria-label="移期日期" name="date" type="date" defaultValue={defaultDate} />
        </label>
        <p className="dialog-hint">默认明天；也可选择任意未来日期。原日期历史会保留。</p>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit">确认移期</button>
        </footer>
      </form>
    </div>
  );
}
function TaskDialog({
  open,
  mode = 'normal',
  editing,
  projects,
  onSave,
  onClose,
}: {
  open: boolean;
  mode?: 'normal' | 'unscheduled';
  editing?: Task;
  projects: Project[];
  onSave: (data: FormData) => string | undefined;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  if (!open) return null;
  const isUnscheduled = mode === 'unscheduled' && !editing?.plannedStartTime;

  return (
    <div className="task-dialog-backdrop" role="presentation">
      <section
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={
          editing
            ? isUnscheduled
              ? '修改无时间待办'
              : '编辑任务'
            : isUnscheduled
              ? '添加无时间待办'
              : '添加任务'
        }
      >
        <form
          action={(data) => {
            const message = onSave(data);
            setError(message);
          }}
        >
          <header>
            <div>
              <p>
                {editing
                  ? isUnscheduled
                    ? '编辑无时间待办'
                    : '编辑任务'
                  : isUnscheduled
                    ? '无时间待办'
                    : '快速新建'}
              </p>
              <h2>
                {editing
                  ? isUnscheduled
                    ? '修改待办事项'
                    : '修改任务'
                  : isUnscheduled
                    ? '添加无时间待办'
                    : '添加任务'}
              </h2>
            </div>
            <button type="button" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </header>
          <label>
            任务名称
            <Input
              name="title"
              defaultValue={editing?.title}
              placeholder="准备要做的事情"
              required
              autoFocus
            />
          </label>

          {isUnscheduled ? (
            <div className="task-form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                项目
                <select name="project" defaultValue={editing?.projectId ?? 'other'}>
                  {projects
                    .filter(
                      (project) =>
                        project.status === 'active' || project.id === editing?.projectId,
                    )
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="task-form-grid">
              <label>
                项目
                <select name="project" defaultValue={editing?.projectId ?? 'other'}>
                  {projects
                    .filter(
                      (project) =>
                        project.status === 'active' || project.id === editing?.projectId,
                    )
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                开始时间
                <Input
                  name="start"
                  defaultValue={editing?.plannedStartTime}
                  placeholder="1420 或 14:20"
                />
              </label>
              <label>
                结束时间
                <Input
                  name="end"
                  defaultValue={editing?.plannedEndTime}
                  placeholder="可选"
                />
              </label>
              <label>
                预计时长（分钟）
                <Input
                  name="planned"
                  type="number"
                  defaultValue={editing?.plannedDurationMinutes}
                />
              </label>
              <label>
                实际时长（分钟）
                <Input
                  name="actual"
                  type="number"
                  defaultValue={editing?.actualDurationMinutes}
                />
              </label>
            </div>
          )}

          {!isUnscheduled && (
            <p>开始和结束同时填写时自动计算预计时长；不支持跨午夜。</p>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button type="submit">保存</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
