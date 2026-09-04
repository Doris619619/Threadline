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

/** 在测试适配器中模拟服务端 merge：结构同步到模板，当前 entry 保留运行态和并发子项。 */
export function mergeLocalDailyTemplate(current: Daily, next: Daily) {
  const usedCurrentIndexes = new Set<number>();
  const mergedChildren = next.children.map((child, index) => {
    const currentIndex = current.children.findIndex((candidate, candidateIndex) => {
      if (usedCurrentIndexes.has(candidateIndex)) return false;
      if (child.id && candidate.id) return child.id === candidate.id;
      if (child.templateItemId && candidate.templateItemId)
        return child.templateItemId === candidate.templateItemId;
      return candidateIndex === index;
    });
    const currentChild = currentIndex >= 0 ? current.children[currentIndex] : undefined;
    if (currentIndex >= 0) usedCurrentIndexes.add(currentIndex);
    const entryItemId = currentChild?.id ?? child.id ?? crypto.randomUUID();
    const templateItemId =
      currentChild?.templateItemId ?? child.templateItemId ?? entryItemId;
    return {
      ...child,
      id: entryItemId,
      templateItemId,
      completed: currentChild?.completed ?? child.completed,
      actual: currentChild?.actual ?? child.actual,
    };
  });
  for (const [index, child] of current.children.entries()) {
    if (usedCurrentIndexes.has(index)) continue;
    const entryItemId = child.id ?? crypto.randomUUID();
    mergedChildren.push({
      ...child,
      id: entryItemId,
      templateItemId: child.templateItemId ?? entryItemId,
    });
  }
  const entry: Daily = {
    ...current,
    title: next.title,
    children: mergedChildren,
  };
  const template: Daily = {
    ...entry,
    entryId: undefined,
    actual: 0,
    result: '',
    completed: false,
    children: mergedChildren.map((child) => ({
      ...child,
      id: child.templateItemId,
      completed: false,
      actual: 0,
    })),
  };
  return { entry, template };
}

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
            : transition,
        date:
          transition === 'scheduled' || transition === 'rescheduled'
            ? targetDate
            : transition === 'waiting'
              ? undefined
              : current.date,
        schedulePendingTime:
          transition === 'scheduled' ? true : transition === 'waiting' ? false : current.schedulePendingTime,
        plannedStartTime:
          transition === 'scheduled' || transition === 'waiting' ? undefined : current.plannedStartTime,
        plannedEndTime:
          transition === 'scheduled' || transition === 'waiting' ? undefined : current.plannedEndTime,
        plannedDurationMinutes:
          transition === 'scheduled' || transition === 'waiting' ? undefined : current.plannedDurationMinutes,
        importance: transition === 'waiting' ? current.importance ?? 'normal' : current.importance,
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
            ...(current.date ? { fromDate: current.date } : {}),
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

  /** 在测试环境中模拟 waiting 完成的数据库原子状态形状与完成历史。 */
  const completeWaitingTask = useCallback(
    async (taskId: string, completedDate: string) => {
      const current = tasks.find((task) => task.id === taskId && task.status === 'waiting');
      if (!current) throw new Error('TEST_WAITING_TASK_NOT_FOUND');
      const completedAt = new Date().toISOString();
      const next: Task = {
        ...current,
        status: 'active',
        date: completedDate,
        schedulePendingTime: false,
        plannedStartTime: undefined,
        plannedEndTime: undefined,
        plannedDurationMinutes: undefined,
        completed: true,
        completedAt,
        updatedAt: completedAt,
      };
      updateTasks((items) => items.map((task) => (task.id === taskId ? next : task)));
      updateHistory((items) => [
        { id: crypto.randomUUID(), taskId, type: 'completed', occurredAt: completedAt, payload: { completed: 'true' } },
        ...items,
      ]);
      return next;
    },
    [tasks, updateHistory, updateTasks],
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
            schedulePendingTime: action.action === 'waiting' ? false : task.schedulePendingTime,
            plannedStartTime: action.action === 'waiting' ? undefined : task.plannedStartTime,
            plannedEndTime: action.action === 'waiting' ? undefined : task.plannedEndTime,
            plannedDurationMinutes:
              action.action === 'waiting' ? undefined : task.plannedDurationMinutes,
            importance: action.action === 'waiting' ? task.importance ?? 'normal' : task.importance,
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
  const taskState = useMemo(
    () => ({
      tasks,
      taskTimeEntries: [],
      taskTimeEntriesAuthoritative: false,
    }),
    [tasks],
  );
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
  /** 在测试适配器中同步模板与当前 snapshot，并模拟服务端 runtime merge。 */
  const createDailyTemplate = useCallback(
    async (daily: Daily) => {
      const template: Daily = {
        ...daily,
        children: daily.children.map((item) => ({
          ...item,
          id: item.templateItemId ?? item.id ?? crypto.randomUUID(),
          templateItemId: item.templateItemId ?? item.id,
          completed: false,
          actual: 0,
        })),
      };
      const entry: Daily = {
        ...template,
        entryId: crypto.randomUUID(),
        children: template.children.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          completed: false,
          actual: 0,
        })),
      };
      updateDailyTemplates((current) => [...current, template]);
      updateDailyByDate((current) => ({
        ...current,
        [selectedDate]: [
          ...(current[selectedDate] ??
            createDailyInstance(selectedDate, dailyTemplates)),
          entry,
        ],
      }));
    },
    [dailyTemplates, selectedDate, updateDailyByDate, updateDailyTemplates],
  );
  /** 在测试适配器中同步模板与当前 snapshot，并模拟服务端 runtime merge。 */
  const saveDailyTemplate = useCallback(
    async (next: Daily) => {
      const currentEntry =
        materializedDailyByDate[selectedDate]?.find((item) => item.id === next.id) ??
        next;
      const merged = mergeLocalDailyTemplate(currentEntry, next);
      updateDailyTemplates((current) =>
        current.map((item) => (item.id === next.id ? merged.template : item)),
      );
      updateDailyByDate((current) => ({
        ...current,
        [selectedDate]: (
          current[selectedDate] ?? createDailyInstance(selectedDate, dailyTemplates)
        ).map((item) => (item.id === next.id ? merged.entry : item)),
      }));
    },
    [
      dailyTemplates,
      materializedDailyByDate,
      selectedDate,
      updateDailyByDate,
      updateDailyTemplates,
    ],
  );
  /** 测试适配器在 localStorage 中模拟项目轻量属性更新。 */
  const updateProject = useCallback(
    async (projectId: string, name: string, color: string) => {
      updateProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, name, color } : project,
        ),
      );
    },
    [updateProjects],
  );
  /** 测试适配器模拟非 fallback 项目的归档切换。 */
  const setProjectArchived = useCallback(
    async (projectId: string, archived: boolean) => {
      updateProjects((current) =>
        current.map((project) =>
          project.id === projectId && !project.isFallback
            ? { ...project, status: archived ? 'archived' : 'active' }
            : project,
        ),
      );
    },
    [updateProjects],
  );
  /** 测试适配器以不可见标记模拟项目软删除，并迁移所有当前 task 到 fallback。 */
  const deleteProject = useCallback(
    async (projectId: string) => {
      const fallback = projects.find((project) => project.isFallback)?.id;
      if (!fallback) throw new Error('TEST_FALLBACK_PROJECT_NOT_FOUND');
      updateTasks((current) =>
        current.map((task) =>
          task.projectId === projectId ? { ...task, projectId: fallback } : task,
        ),
      );
      updateProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? { ...project, deletedAt: new Date().toISOString(), status: 'archived' }
            : project,
        ),
      );
    },
    [projects, updateProjects, updateTasks],
  );
  /** 测试适配器只改模板生命周期，已生成日期实例保持原样。 */
  const setDailyTemplateStatus = useCallback(
    async (templateId: string, status: 'archive' | 'restore' | 'delete') => {
      const now = new Date().toISOString();
      updateDailyTemplates((current) =>
        current.map((daily) =>
          daily.id !== templateId
            ? daily
            : status === 'delete'
              ? { ...daily, active: false, deletedAt: now }
              : { ...daily, active: status === 'restore', deletedAt: undefined },
        ),
      );
    },
    [updateDailyTemplates],
  );
  /** 测试适配器只改模板清单生命周期，已生成日期实例保持原样。 */
  const setDailyTemplateItemStatus = useCallback(
    async (itemId: string, status: 'archive' | 'restore' | 'delete') => {
      const now = new Date().toISOString();
      updateDailyTemplates((current) =>
        current.map((daily) => ({
          ...daily,
          children: daily.children.map((item) =>
            (item.templateItemId ?? item.id) !== itemId
              ? item
              : status === 'delete'
                ? { ...item, active: false, deletedAt: now }
                : { ...item, active: status === 'restore', deletedAt: undefined },
          ),
        })),
      );
    },
    [updateDailyTemplates],
  );
  const commands = useMemo(
    () => ({
      createTask,
      createProject,
      updateProject,
      setProjectArchived,
      deleteProject,
      createDailyTemplate,
      saveDailyTemplate,
      setDailyTemplateStatus,
      setDailyTemplateItemStatus,
      transitionTask,
      completeWaitingTask,
      recordDaily,
      closeDay,
    }),
    [
      closeDay,
      createProject,
      createTask,
      createDailyTemplate,
      deleteProject,
      recordDaily,
      saveDailyTemplate,
      setDailyTemplateItemStatus,
      setDailyTemplateStatus,
      setProjectArchived,
      transitionTask,
      completeWaitingTask,
      updateProject,
    ],
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
