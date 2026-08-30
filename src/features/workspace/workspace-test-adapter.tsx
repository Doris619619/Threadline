/**
 * @fileoverview 仅为 Playwright/Electron 显式测试构建提供隔离的 localStorage 工作区适配器。
 */

'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import { useWorkspaceView } from '@/components/app-shell';
import type { Daily, DailyHistoryEntry } from '@/features/daily/types';
import { getDailyActualMinutes, isDailyCompleted } from '@/features/daily/daily-rules';
import {
  WorkspaceContextProviders,
  type CloseAction,
  type TaskTransition,
} from '@/features/workspace/workspace-data-context';
import {
  createDailyInstance,
  createInitialTasks,
  createProjectSeed,
  withoutExpiredTasks,
} from '@/features/workspace/workspace-seed';
import { useAnnotationStrokes } from '@/hooks/use-annotation-strokes';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { getLocalDateKey } from '@/lib/local-date';
import type { CloseRecord, HistoryEvent, Project, Task } from '@/types/domain';

/**
 * 仅供 Playwright/Electron 显式测试构建使用的本地适配器；生产构建不会挂载。
 */
export function LocalWorkspaceTestAdapter({ children }: { children: ReactNode }) {
  const { selectedDate } = useWorkspaceView();
  const [tasks, updateTasks, tasksHydrated] = usePersistentState(
    'threadline.tasks.v1',
    () => withoutExpiredTasks(createInitialTasks()),
    withoutExpiredTasks,
  );
  const [projects, updateProjects, projectsHydrated] = usePersistentState(
    'threadline.projects.v1',
    createProjectSeed,
  );
  const [dailyByDate, updateDailyByDate, dailyHydrated] = usePersistentState<
    Record<string, Daily[]>
  >('threadline.daily-by-date.v1', () => ({
    [getLocalDateKey()]: createDailyInstance(getLocalDateKey()),
  }));
  const [dailyTemplates, updateDailyTemplates, templatesHydrated] = usePersistentState<
    Daily[]
  >('threadline.daily-templates.v1', () => createDailyInstance(getLocalDateKey()));
  const [dailyHistory, updateDailyHistory, dailyHistoryHydrated] = usePersistentState<
    DailyHistoryEntry[]
  >('threadline.daily-history.v1', []);
  const [history, updateHistory, historyHydrated] = usePersistentState<HistoryEvent[]>(
    'threadline.history.v1',
    [],
  );
  const [closeRecords, updateCloseRecords, closeHydrated] = usePersistentState<
    CloseRecord[]
  >('threadline.close-records.v1', []);
  const [workstationTaskIds, updateWorkstationTaskIds, workstationHydrated] =
    usePersistentState<string[]>('threadline.workstation.v1', []);
  const [annotationStrokes, updateAnnotationStrokes, annotationHydrated] =
    useAnnotationStrokes();
  const [highlightColor, updateHighlightColor, highlightHydrated] =
    usePersistentState<string>(
      'threadline.annotation-highlight-color.v1',
      'rgba(255, 225, 53, 0.42)',
    );
  const materializedDailyByDate = useMemo(
    () =>
      Object.hasOwn(dailyByDate, selectedDate)
        ? dailyByDate
        : {
            ...dailyByDate,
            [selectedDate]: createDailyInstance(selectedDate, dailyTemplates),
          },
    [dailyByDate, dailyTemplates, selectedDate],
  );

  /** 显式测试适配器按既有顺序创建 task 与 created history。 */
  const createTask = useCallback(
    async (task: Task) => {
      updateTasks((current) => [...current, task]);
      updateHistory((current) => [
        {
          id: crypto.randomUUID(),
          taskId: task.id,
          type: 'created',
          occurredAt: new Date().toISOString(),
          payload: { title: task.title },
        },
        ...current,
      ]);
      return task;
    },
    [updateHistory, updateTasks],
  );

  /** 测试适配器也先确认项目进入本地真源，再返回可用于 task 的稳定 project。 */
  const createProject = useCallback(
    async (project: Project) => {
      updateProjects((current) => [...current, project]);
      return project;
    },
    [updateProjects],
  );

  const transitionTask = useCallback(
    async (taskId: string, transition: TaskTransition, targetDate?: string) => {
      const current = tasks.find((task) => task.id === taskId);
      if (!current) throw new Error('TEST_TASK_NOT_FOUND');
      const now = new Date().toISOString();
      const next: Task = {
        ...current,
        status:
          transition === 'scheduled' || transition === 'rescheduled'
            ? 'active'
            : transition === 'backlog'
              ? 'backlog'
              : transition,
        date:
          transition === 'scheduled' || transition === 'rescheduled'
            ? targetDate
            : undefined,
        postponedFrom:
          transition !== 'scheduled'
            ? (current.date ?? current.postponedFrom)
            : current.postponedFrom,
        postponedTo: transition === 'rescheduled' ? targetDate : current.postponedTo,
        completed:
          transition === 'scheduled' || transition === 'rescheduled'
            ? false
            : current.completed,
        completedAt:
          transition === 'scheduled' || transition === 'rescheduled'
            ? undefined
            : current.completedAt,
        abandonedAt: transition === 'abandoned' ? now : current.abandonedAt,
        deletedAt: transition === 'trashed' ? now : current.deletedAt,
        updatedAt: now,
      };
      updateTasks((items) => items.map((task) => (task.id === taskId ? next : task)));
      updateHistory((items) => [
        {
          id: crypto.randomUUID(),
          taskId,
          type: transition,
          occurredAt: now,
          payload: {
            fromDate: current.date ?? getLocalDateKey(),
            ...(targetDate ? { toDate: targetDate } : {}),
          },
        },
        ...items,
      ]);
      if (transition === 'trashed') {
        updateWorkstationTaskIds((items) => items.filter((id) => id !== taskId));
        updateAnnotationStrokes((items) =>
          items.filter((stroke) => stroke.targetTaskId !== taskId),
        );
      }
      return next;
    },
    [
      tasks,
      updateAnnotationStrokes,
      updateHistory,
      updateTasks,
      updateWorkstationTaskIds,
    ],
  );

  const recordDaily = useCallback(
    async (templateId: string, date: string) => {
      const daily = dailyByDate[date]?.find((item) => item.id === templateId);
      if (!daily) throw new Error('TEST_DAILY_NOT_FOUND');
      updateDailyHistory((current) =>
        current.some((entry) => entry.dailyId === templateId && entry.date === date)
          ? current
          : [
              {
                id: crypto.randomUUID(),
                dailyId: templateId,
                projectId: daily.projectId,
                date,
                completed: isDailyCompleted(daily),
                actual: getDailyActualMinutes(daily),
                result: daily.result,
              },
              ...current,
            ],
      );
    },
    [dailyByDate, updateDailyHistory],
  );

  const closeDay = useCallback(
    async (
      date: string,
      actions: CloseAction[],
      projectMinutes: Record<string, number>,
    ) => {
      const now = new Date().toISOString();
      const actionByTask = new Map(actions.map((action) => [action.taskId, action]));
      updateTasks((current) =>
        current.map((task) => {
          const action = actionByTask.get(task.id);
          if (!action) return task;
          return {
            ...task,
            status:
              action.action === 'tomorrow' || action.action === 'date'
                ? 'active'
                : action.action,
            date:
              action.action === 'tomorrow' || action.action === 'date'
                ? action.targetDate
                : action.action === 'abandoned'
                  ? task.date
                  : undefined,
            postponedFrom:
              action.action === 'tomorrow' || action.action === 'date'
                ? task.date
                : task.postponedFrom,
            postponedTo:
              action.action === 'tomorrow' || action.action === 'date'
                ? action.targetDate
                : task.postponedTo,
            abandonedAt: action.action === 'abandoned' ? now : task.abandonedAt,
            updatedAt: now,
          };
        }),
      );
      updateHistory((current) => [
        ...actions.map((action) => ({
          id: crypto.randomUUID(),
          taskId: action.taskId,
          type: `close_${action.action}`,
          occurredAt: now,
          payload: {
            fromDate: date,
            ...(action.targetDate ? { toDate: action.targetDate } : {}),
          },
        })),
        ...current,
      ]);
      for (const daily of dailyByDate[date] ?? []) await recordDaily(daily.id, date);
      updateCloseRecords((current) => [
        ...current.filter((record) => record.date !== date),
        {
          id: crypto.randomUUID(),
          date,
          closedAt: new Date().toISOString(),
          projectMinutes,
        },
      ]);
    },
    [dailyByDate, recordDaily, updateCloseRecords, updateHistory, updateTasks],
  );

  const hydrated =
    tasksHydrated &&
    projectsHydrated &&
    dailyHydrated &&
    templatesHydrated &&
    dailyHistoryHydrated &&
    historyHydrated &&
    closeHydrated &&
    workstationHydrated &&
    annotationHydrated &&
    highlightHydrated;
  const taskState = useMemo(() => ({ tasks, taskTimeEntries: [] }), [tasks]);
  const taskActions = useMemo(() => ({ updateTasks }), [updateTasks]);
  const projectState = useMemo(() => ({ projects }), [projects]);
  const projectActions = useMemo(() => ({ updateProjects }), [updateProjects]);
  const dailyState = useMemo(
    () => ({ dailyByDate: materializedDailyByDate, dailyTemplates, dailyHistory }),
    [dailyHistory, dailyTemplates, materializedDailyByDate],
  );
  const dailyActions = useMemo(
    () => ({ updateDailyByDate, updateDailyTemplates, updateDailyHistory }),
    [updateDailyByDate, updateDailyHistory, updateDailyTemplates],
  );
  const historyState = useMemo(
    () => ({ history, closeRecords }),
    [closeRecords, history],
  );
  const historyActions = useMemo(
    () => ({ updateHistory, updateCloseRecords }),
    [updateCloseRecords, updateHistory],
  );
  const surfaceState = useMemo(
    () => ({ annotationStrokes, workstationTaskIds, highlightColor }),
    [annotationStrokes, highlightColor, workstationTaskIds],
  );
  const surfaceActions = useMemo(
    () => ({ updateAnnotationStrokes, updateWorkstationTaskIds, updateHighlightColor }),
    [updateAnnotationStrokes, updateHighlightColor, updateWorkstationTaskIds],
  );
  /** 在显式测试适配器中模拟模板 RPC 的成功回写，保证本地与云端编辑语义一致。 */
  const saveDailyTemplate = useCallback(
    async (next: Daily) => {
      updateDailyTemplates((current) =>
        current.map((item) => (item.id === next.id ? next : item)),
      );
    },
    [updateDailyTemplates],
  );
  const commands = useMemo(
    () => ({
      createTask,
      createProject,
      saveDailyTemplate,
      transitionTask,
      recordDaily,
      closeDay,
    }),
    [closeDay, createProject, createTask, recordDaily, saveDailyTemplate, transitionTask],
  );

  return (
    <WorkspaceContextProviders
      values={{
        hydrated,
        taskState,
        taskActions,
        projectState,
        projectActions,
        dailyState,
        dailyActions,
        historyState,
        historyActions,
        surfaceState,
        surfaceActions,
        commands,
      }}
    >
      {children}
    </WorkspaceContextProviders>
  );
}
