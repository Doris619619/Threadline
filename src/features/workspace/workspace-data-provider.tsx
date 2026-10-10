/**
 * @fileoverview 以 Supabase 为业务真源组合细粒度查询、命令和本机 Annotation UI 状态。
 */

'use client';

import type { DailyBundle } from '@/lib/supabase/workspace-repository';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceView } from '@/components/app-shell';
import type { Daily, DailyHistoryEntry } from '@/features/daily/types';
import { useCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { useSessionReadiness } from '@/features/startup/use-session-readiness';
import { useOptionalStartupProgress } from '@/features/startup/startup-progress-context';
import {
  WorkspaceContextProviders,
  type CloseAction,
  type TaskTransition,
} from '@/features/workspace/workspace-data-context';
export { useWorkspaceData } from '@/features/workspace/workspace-data-context';
import { LocalWorkspaceTestAdapter } from '@/features/workspace/workspace-test-adapter';
import { useCloudWorkstation } from '@/features/workspace/use-cloud-workstation';
import { createCloudTask } from '@/features/workspace/create-cloud-task';
import { createWorkspaceRealtimeRefresh } from './workspace-realtime-refresh';
import { useCloudTaskUpdates } from '@/features/workspace/use-cloud-task-updates';
import { TaskConflictDrafts } from '@/features/workspace/task-conflict-drafts';
import { usesLocalWorkspace } from '@/lib/workspace-runtime';
import { useAnnotationStrokes } from '@/hooks/use-annotation-strokes';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { createMutationFeedback } from '@/lib/mutation-feedback';

import type { CloseRecord, HistoryEvent, Project, Task } from '@/types/domain';

/** 解析 React setter，并保证异步写入读取 Query cache 中的最新集合。 */
function resolveState<T>(current: T, action: SetStateAction<T>): T {
  return typeof action === 'function'
    ? (action as (previous: T) => T)(current)
    : action;
}

/** 用稳定 JSON 比较领域 snapshot；server-returned row 最终替换 Query cache。 */
function changed(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

/** 吸收已提交写入后的 bundle 刷新失败，只暴露需重新加载的同步提示。 */
export async function settleDailyTemplatePostCommitRefresh(
  refresh: () => Promise<void>,
  invalidate: () => Promise<unknown>,
  onWarning: (message: string) => void,
): Promise<void> {
  try {
    await refresh();
  } catch (error) {
    onWarning(
      `Daily 模板已保存，但最新内容刷新失败：${
        error instanceof Error ? error.message : '请稍后重新加载'
      }`,
    );
    void Promise.resolve()
      .then(invalidate)
      .catch(() => undefined);
  }
}

/** 云端 Workspace Provider；普通字段细粒度写，复合业务交给显式原子命令。 */
function CloudWorkspaceDataProvider({ children }: { children: ReactNode }) {
  const { selectedDate } = useWorkspaceView();
  const { client, repository, user } = useCloudRuntime();
  const startupProgress = useOptionalStartupProgress();
  const setRealtimeStatus = startupProgress?.setRealtimeStatus;
  const setWorkspaceDataStatus = startupProgress?.setWorkspaceDataStatus;
  const queryClient = useQueryClient();
  const ownerKey = user.id;
  const [mutationError, setMutationError] = useState<string>();
  const mutationFeedback = useMemo(() => createMutationFeedback(setMutationError), []);
  const reportMutationError = mutationFeedback.report;
  const [highlightColor, updateHighlightColor, highlightHydrated] =
    usePersistentState<string>(
      'threadline.annotation-highlight-color.v1',
      'rgba(255, 225, 53, 0.42)',
    );

  const projectsQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'projects'],
    queryFn: ({ signal }) => repository.listProjects(signal),
  });
  const {
    query: tasksQuery,
    tasks,
    updateTasks,
    commitTask,
    saveTaskConfirmed,
    conflictedDrafts,
    dismissConflict,
  } = useCloudTaskUpdates(ownerKey, repository, setMutationError, mutationFeedback);
  const confirmedTaskIds = useMemo(
    () => (tasksQuery.data ?? []).map((task) => task.id),
    [tasksQuery.data],
  );
  const [
    annotationStrokes,
    updateAnnotationStrokes,
    annotationHydrated,
    annotationImport,
  ] = useAnnotationStrokes(ownerKey, confirmedTaskIds);
  const taskTimeEntriesQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'task-time-entries'],
    queryFn: ({ signal }) => repository.listTaskTimeEntries(signal),
  });
  const dailyQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'daily'],
    queryFn: ({ signal }) => repository.listDailyBundle(signal),
  });
  const dailyHistoryQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'daily-history'],
    queryFn: ({ signal }) => repository.listDailyHistory(signal),
  });
  const historyQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'history'],
    queryFn: ({ signal }) => repository.listHistory(signal),
  });
  const closeRecordsQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'close-records'],
    queryFn: ({ signal }) => repository.listCloseRecords(signal),
  });
  const {
    query: workstationQuery,
    workstationTaskIds,
    updateWorkstationTaskIds,
    runWorkstationCommand,
  } = useCloudWorkstation(ownerKey, repository, setMutationError, mutationFeedback);

  const taskTimeEntries = useMemo(
    () => taskTimeEntriesQuery.data ?? [],
    [taskTimeEntriesQuery.data],
  );
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const dailyByDate = useMemo(
    () => dailyQuery.data?.dailyByDate ?? {},
    [dailyQuery.data?.dailyByDate],
  );
  const dailyTemplates = useMemo(
    () => dailyQuery.data?.dailyTemplates ?? [],
    [dailyQuery.data?.dailyTemplates],
  );
  const dailyHistory = useMemo(
    () => dailyHistoryQuery.data ?? [],
    [dailyHistoryQuery.data],
  );
  const history = useMemo(() => historyQuery.data ?? [], [historyQuery.data]);
  const closeRecords = useMemo(
    () => closeRecordsQuery.data ?? [],
    [closeRecordsQuery.data],
  );

  /** 拒绝离线写；重试保留旧错误至确认成功，失败不建立离线队列。 */
  const runMutation = useCallback(
    async (operation: () => Promise<void>) => {
      const confirmFeedback = mutationFeedback.begin();
      if (!navigator.onLine) {
        reportMutationError('当前离线。Threadline 第一版不会排队写入，请联网后重试。');
        return;
      }
      try {
        await operation();
        confirmFeedback();
      } catch (error) {
        reportMutationError(error instanceof Error ? error.message : '云端写入失败');
      }
    },
    [mutationFeedback, reportMutationError],
  );

  const invalidateWorkspace = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['workspace', ownerKey] }),
    [ownerKey, queryClient],
  );

  useEffect(() => {
    if (!dailyQuery.isSuccess || Object.hasOwn(dailyByDate, selectedDate)) return;
    if (!navigator.onLine) return;
    void repository
      .ensureDailyDate(selectedDate)
      .then((bundle) =>
        queryClient.setQueryData(['workspace', ownerKey, 'daily'], bundle),
      )
      .catch((error: unknown) =>
        reportMutationError(
          error instanceof Error ? error.message : 'Daily 实例化失败',
        ),
      );
  }, [
    dailyByDate,
    dailyQuery.isSuccess,
    ownerKey,
    queryClient,
    reportMutationError,
    repository,
    selectedDate,
  ]);

  useEffect(() => {
    if (!tasksQuery.isSuccess || !annotationHydrated) return;
    const controller = new AbortController();
    const confirmed = new Map(tasksQuery.data.map((task) => [task.id, task]));
    const missing = [
      ...new Set(
        annotationStrokes.flatMap((stroke) =>
          stroke.targetTaskId && !confirmed.has(stroke.targetTaskId)
            ? [stroke.targetTaskId]
            : [],
        ),
      ),
    ];
    void repository
      .findTasksByIds(missing, ownerKey, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        for (const task of found) confirmed.set(task.id, task);
        const checkedMissing = new Set(missing);
        updateAnnotationStrokes((current) =>
          current.filter(
            (stroke) =>
              !stroke.targetTaskId ||
              (confirmed.has(stroke.targetTaskId)
                ? confirmed.get(stroke.targetTaskId)!.status !== 'trashed'
                : !checkedMissing.has(stroke.targetTaskId)),
          ),
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          reportMutationError(`批注核对失败，已保留原笔迹：${String(error)}`);
      });
    return () => controller.abort();
  }, [
    annotationHydrated,
    annotationStrokes,
    ownerKey,
    reportMutationError,
    repository,
    tasksQuery.data,
    tasksQuery.isSuccess,
    updateAnnotationStrokes,
  ]);

  useEffect(() => {
    const refresh = createWorkspaceRealtimeRefresh(queryClient, ownerKey);
    const tables = [
      'projects',
      'tasks',
      'stage_plans',
      'task_time_entries',
      'daily_templates',
      'daily_template_items',
      'daily_entries',
      'daily_entry_items',
      'workstation_entries',
      'daily_history_entries',
      'history_events',
      'daily_close_records',
    ];
    let active = true;
    let channel = client.channel(`workspace:${ownerKey}`);
    for (const table of tables) {
      const invalidate = () => refresh.notify(table);
      channel = channel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table,
            filter: `owner_id=eq.${ownerKey}`,
          },
          invalidate,
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table,
            filter: `owner_id=eq.${ownerKey}`,
          },
          invalidate,
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table },
          invalidate,
        );
    }
    setRealtimeStatus?.({ status: 'active' });
    channel.subscribe((status) => {
      if (!active) return;
      if (status === 'SUBSCRIBED') {
        setRealtimeStatus?.({ status: 'completed' });
        invalidateWorkspace();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setRealtimeStatus?.({
          status: 'failed',
          message: '实时同步连接暂不可用，工作台仍可正常使用。',
        });
      }
    });
    return () => {
      active = false;
      refresh.dispose();
      void client.removeChannel(channel);
    };
  }, [client, invalidateWorkspace, ownerKey, queryClient, setRealtimeStatus]);

  const updateProjects: Dispatch<SetStateAction<Project[]>> = useCallback(
    (action) => {
      void runMutation(async () => {
        const current =
          queryClient.getQueryData<Project[]>(['workspace', ownerKey, 'projects']) ??
          projects;
        const next = resolveState(current, action);
        const currentById = new Map(current.map((project) => [project.id, project]));
        const saved = await Promise.all(
          next
            .filter((project) => changed(currentById.get(project.id), project))
            .map((project) => repository.saveProject(project)),
        );
        queryClient.setQueryData<Project[]>(
          ['workspace', ownerKey, 'projects'],
          next.map((project) => saved.find((row) => row.id === project.id) ?? project),
        );
      });
    },
    [ownerKey, projects, queryClient, repository, runMutation],
  );

  /** 首页单个实例的可等待保存；失败由执行行展示并保留草稿。 */
  const saveDailyEntry = useCallback(
    async (daily: Daily, date: string) => {
      if (!navigator.onLine)
        throw new Error('当前离线，无法保存 Daily，请联网后重试。');
      await repository.saveDailyEntry(daily);
      await queryClient.cancelQueries({ queryKey: ['workspace', ownerKey, 'daily'] });
      queryClient.setQueryData<DailyBundle>(
        ['workspace', ownerKey, 'daily'],
        (bundle) =>
          bundle
            ? {
                ...bundle,
                dailyByDate: {
                  ...bundle.dailyByDate,
                  [date]: (bundle.dailyByDate[date] ?? []).map((item) =>
                    item.id === daily.id ? daily : item,
                  ),
                },
              }
            : bundle,
      );
    },
    [ownerKey, queryClient, repository],
  );

  const updateDailyByDate: Dispatch<SetStateAction<Record<string, Daily[]>>> =
    useCallback(
      (action) => {
        void runMutation(async () => {
          const current =
            queryClient.getQueryData<{
              dailyByDate: Record<string, Daily[]>;
              dailyTemplates: Daily[];
            }>(['workspace', ownerKey, 'daily'])?.dailyByDate ?? dailyByDate;
          const next = resolveState(current, action);
          for (const [date, nextItems] of Object.entries(next)) {
            const currentById = new Map(
              (current[date] ?? []).map((daily) => [daily.id, daily]),
            );
            for (const daily of nextItems) {
              if (daily.entryId && changed(currentById.get(daily.id), daily))
                await repository.saveDailyEntry(daily);
            }
          }
          queryClient.setQueryData(
            ['workspace', ownerKey, 'daily'],
            await repository.listDailyBundle(),
          );
        });
      },
      [dailyByDate, ownerKey, queryClient, repository, runMutation],
    );

  const updateDailyTemplates: Dispatch<SetStateAction<Daily[]>> = useCallback(
    (action) => {
      void runMutation(async () => {
        const current = dailyTemplates;
        const next = resolveState(current, action);
        const existing = new Set(current.map((daily) => daily.id));
        for (const daily of next.filter((item) => !existing.has(item.id)))
          await repository.createDailyTemplate(daily, selectedDate);
        queryClient.setQueryData(
          ['workspace', ownerKey, 'daily'],
          await repository.listDailyBundle(),
        );
      });
    },
    [dailyTemplates, ownerKey, queryClient, repository, runMutation, selectedDate],
  );

  const updateDailyHistory: Dispatch<SetStateAction<DailyHistoryEntry[]>> = useCallback(
    (action) => {
      void runMutation(async () => {
        const next = resolveState(dailyHistory, action);
        const currentKeys = new Set(
          dailyHistory.map((entry) => `${entry.dailyId}:${entry.date}`),
        );
        for (const entry of next.filter(
          (item) => !currentKeys.has(`${item.dailyId}:${item.date}`),
        ))
          await repository.recordDaily(entry.dailyId, entry.date, 'manual');
        await queryClient.invalidateQueries({
          queryKey: ['workspace', ownerKey, 'daily-history'],
        });
      });
    },
    [dailyHistory, ownerKey, queryClient, repository, runMutation],
  );

  const updateHistory: Dispatch<SetStateAction<HistoryEvent[]>> = useCallback(
    (action) => {
      void runMutation(async () => {
        const next = resolveState(history, action);
        const existing = new Set(history.map((event) => event.id));
        for (const event of next.filter((item) => !existing.has(item.id)))
          await repository.appendHistory(
            event,
            event.taskId ? tasks.find((task) => task.id === event.taskId) : undefined,
          );
        await queryClient.invalidateQueries({
          queryKey: ['workspace', ownerKey, 'history'],
        });
      });
    },
    [history, ownerKey, queryClient, repository, runMutation, tasks],
  );

  const updateCloseRecords: Dispatch<SetStateAction<CloseRecord[]>> =
    useCallback(() => {
      reportMutationError('每日收尾必须通过 closeDay 原子命令提交。');
    }, [reportMutationError]);

  /** 任务本体确认即结束创建表单；命令在确认时清旧错误，再独立报告记录收尾失败。 */
  const createTask = useCallback(
    (task: Task) => {
      return createCloudTask(
        task,
        projects,
        repository,
        queryClient,
        ownerKey,
        setMutationError,
        mutationFeedback,
      );
    },
    [mutationFeedback, ownerKey, projects, queryClient, repository],
  );

  /** 保留流转失败直到命令确认；关联记录刷新独立收尾，不闪空全局错误区。 */
  const transitionTask = useCallback(
    async (taskId: string, transition: TaskTransition, targetDate?: string) => {
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法提交任务流转。');
        const task = await commitTask(
          taskId,
          (current) => ({
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
              transition === 'scheduled'
                ? true
                : transition === 'waiting'
                  ? false
                  : current.schedulePendingTime,
            plannedStartTime:
              transition === 'scheduled' || transition === 'waiting'
                ? undefined
                : current.plannedStartTime,
            plannedEndTime:
              transition === 'scheduled' || transition === 'waiting'
                ? undefined
                : current.plannedEndTime,
          }),
          () => repository.transitionTask(taskId, transition, targetDate),
        );
        if (transition === 'trashed') {
          updateAnnotationStrokes((current) =>
            current.filter((stroke) => stroke.targetTaskId !== taskId),
          );
          queryClient.setQueryData<string[]>(
            ['workspace', ownerKey, 'workstation'],
            (current = []) => current.filter((id) => id !== taskId),
          );
        }
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['workspace', ownerKey, 'history'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['workspace', ownerKey, 'workstation'],
          }),
        ]).catch(() =>
          reportMutationError('任务已更新，但关联记录刷新失败，请重新加载。'),
        );
        return task;
      } catch (error) {
        reportMutationError(error instanceof Error ? error.message : '任务流转失败');
        throw error;
      }
    },
    [
      commitTask,
      ownerKey,
      queryClient,
      reportMutationError,
      repository,
      updateAnnotationStrokes,
    ],
  );

  /** 完成待安排任务时由数据库先补齐本地业务日，再触发完成历史写入。 */
  const completeWaitingTask = useCallback(
    async (taskId: string, completedDate: string) => {
      if (!navigator.onLine) {
        const message = '当前离线，无法完成待安排任务。';
        reportMutationError(message);
        throw new Error(message);
      }
      const task = await commitTask(
        taskId,
        (current) => ({
          ...current,
          status: 'active',
          completed: true,
          date: completedDate,
          schedulePendingTime: false,
          plannedStartTime: undefined,
          plannedEndTime: undefined,
        }),
        () => repository.completeWaitingTask(taskId, completedDate),
      );
      void queryClient
        .invalidateQueries({
          queryKey: ['workspace', ownerKey, 'history'],
        })
        .catch(() => reportMutationError('任务已完成，但历史刷新失败，请重新加载。'));
      return task;
    },
    [commitTask, ownerKey, queryClient, reportMutationError, repository],
  );

  /** 正式记录与历史刷新均确认后才清旧错误，失败保持可恢复的信息。 */
  const recordDaily = useCallback(
    async (
      templateId: string,
      date: string,
      source: 'manual' | 'close_day' = 'manual',
    ) => {
      const confirmFeedback = mutationFeedback.begin();
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法记录 Daily。');
        await repository.recordDaily(templateId, date, source);
        await queryClient.invalidateQueries({
          queryKey: ['workspace', ownerKey, 'daily-history'],
        });
        confirmFeedback();
      } catch (error) {
        reportMutationError(error instanceof Error ? error.message : 'Daily 记录失败');
        throw error;
      }
    },
    [mutationFeedback, ownerKey, queryClient, reportMutationError, repository],
  );

  /** 原子收尾并刷新确认集合；重试期间保留旧错误，成功后才清除。 */
  const closeDay = useCallback(
    async (
      date: string,
      actions: CloseAction[],
      projectMinutes: Record<string, number>,
    ) => {
      const confirmFeedback = mutationFeedback.begin();
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法完成每日收尾。');
        await repository.closeDay(date, actions, projectMinutes);
        await invalidateWorkspace();
        confirmFeedback();
      } catch (error) {
        reportMutationError(error instanceof Error ? error.message : '每日收尾失败');
        throw error;
      }
    },
    [invalidateWorkspace, mutationFeedback, reportMutationError, repository],
  );

  const allLoaded =
    projectsQuery.isSuccess &&
    tasksQuery.isSuccess &&
    taskTimeEntriesQuery.isSuccess &&
    dailyQuery.isSuccess &&
    dailyHistoryQuery.isSuccess &&
    historyQuery.isSuccess &&
    closeRecordsQuery.isSuccess &&
    workstationQuery.isSuccess &&
    annotationHydrated &&
    highlightHydrated;
  const hydrated = useSessionReadiness(ownerKey, allLoaded);
  const queryError = [
    projectsQuery.error,
    tasksQuery.error,
    taskTimeEntriesQuery.error,
    dailyQuery.error,
    dailyHistoryQuery.error,
    historyQuery.error,
    closeRecordsQuery.error,
    workstationQuery.error,
  ].find(Boolean);

  useEffect(() => {
    if (!setWorkspaceDataStatus) return;
    if (queryError && !hydrated) {
      setWorkspaceDataStatus({
        status: 'failed',
        retry: () => {
          void invalidateWorkspace();
        },
        message:
          queryError instanceof Error ? queryError.message : '云工作区数据载入失败',
      });
      return;
    }
    setWorkspaceDataStatus({ status: hydrated ? 'completed' : 'active' });
  }, [hydrated, invalidateWorkspace, queryError, setWorkspaceDataStatus]);

  const taskState = useMemo(
    () => ({ tasks, taskTimeEntries, taskTimeEntriesAuthoritative: true }),
    [tasks, taskTimeEntries],
  );

  /** 等待项目确认后清旧错误，再让调用方使用其 ID 创建或改派任务。 */
  const createProject = useCallback(
    async (project: Project) => {
      const confirmFeedback = mutationFeedback.begin();
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法创建项目。');
        const saved = await repository.saveProject(project);
        queryClient.setQueryData<Project[]>(
          ['workspace', ownerKey, 'projects'],
          (current = []) => [...current.filter((item) => item.id !== saved.id), saved],
        );
        confirmFeedback();
        return saved;
      } catch (error) {
        reportMutationError(error instanceof Error ? error.message : '项目创建失败');
        throw error;
      }
    },
    [mutationFeedback, ownerKey, queryClient, reportMutationError, repository],
  );

  /** 更新项目轻量属性，并用 RPC 返回的 row 替换本地缓存。 */
  const updateProject = useCallback(
    async (projectId: string, name: string, color: string) => {
      const saved = await repository.updateProjectDetails(projectId, name, color);
      queryClient.setQueryData<Project[]>(
        ['workspace', ownerKey, 'projects'],
        (current = []) =>
          current.map((project) => (project.id === saved.id ? saved : project)),
      );
    },
    [ownerKey, queryClient, repository],
  );

  /** 归档状态交由数据库校验 fallback 约束，提交后刷新关联工作区缓存。 */
  const setProjectArchived = useCallback(
    async (projectId: string, archived: boolean) => {
      await repository.setProjectArchived(projectId, archived);
      await invalidateWorkspace();
    },
    [invalidateWorkspace, repository],
  );

  /** 安全删除项目并让数据库迁移所有当前 task，历史账本不在客户端触碰。 */
  const deleteProject = useCallback(
    async (projectId: string) => {
      await repository.softDeleteProject(projectId);
      await invalidateWorkspace();
    },
    [invalidateWorkspace, repository],
  );

  /** 保留重试错误到 RPC 确认；其后刷新失败独立报告，避免重复写入已确认模板。 */
  const saveDailyTemplate = useCallback(
    async (daily: Daily) => {
      const confirmFeedback = mutationFeedback.begin();
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法保存 Daily 模板。');
        await repository.updateDailyTemplate(daily);
        confirmFeedback();
      } catch (error) {
        reportMutationError(
          error instanceof Error ? error.message : 'Daily 模板保存失败',
        );
        throw error;
      }

      await settleDailyTemplatePostCommitRefresh(
        async () => {
          queryClient.setQueryData(
            ['workspace', ownerKey, 'daily'],
            await repository.listDailyBundle(),
          );
        },
        () =>
          queryClient.invalidateQueries({
            queryKey: ['workspace', ownerKey, 'daily'],
          }),
        reportMutationError,
      );
    },
    [mutationFeedback, ownerKey, queryClient, reportMutationError, repository],
  );
  /** 原子创建模板和当前日期 entry，确认后清旧错误并刷新完整 Daily bundle。 */
  const createDailyTemplate = useCallback(
    async (daily: Daily) => {
      const confirmFeedback = mutationFeedback.begin();
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法创建 Daily 模板。');
        await repository.createDailyTemplate(daily, selectedDate);
        confirmFeedback();
      } catch (error) {
        reportMutationError(
          error instanceof Error ? error.message : 'Daily 模板创建失败',
        );
        throw error;
      }
      await settleDailyTemplatePostCommitRefresh(
        async () => {
          queryClient.setQueryData(
            ['workspace', ownerKey, 'daily'],
            await repository.listDailyBundle(),
          );
        },
        () =>
          queryClient.invalidateQueries({
            queryKey: ['workspace', ownerKey, 'daily'],
          }),
        reportMutationError,
      );
    },
    [
      mutationFeedback,
      ownerKey,
      queryClient,
      reportMutationError,
      repository,
      selectedDate,
    ],
  );
  /** 修改 Daily 生命周期只影响未来实例；刷新 bundle 以反映 archive/delete。 */
  const setDailyTemplateStatus = useCallback(
    async (templateId: string, status: 'archive' | 'restore' | 'delete') => {
      await repository.setDailyTemplateStatus(templateId, status);
      await invalidateWorkspace();
    },
    [invalidateWorkspace, repository],
  );
  /** 修改清单项生命周期只影响未来实例；已生成 entry 的 snapshot 保持原样。 */
  const setDailyTemplateItemStatus = useCallback(
    async (itemId: string, status: 'archive' | 'restore' | 'delete') => {
      await repository.setDailyTemplateItemStatus(itemId, status);
      await invalidateWorkspace();
    },
    [invalidateWorkspace, repository],
  );
  const taskActions = useMemo(() => ({ updateTasks }), [updateTasks]);
  const projectState = useMemo(() => ({ projects }), [projects]);
  const projectActions = useMemo(() => ({ updateProjects }), [updateProjects]);
  const dailyState = useMemo(
    () => ({ dailyByDate, dailyTemplates, dailyHistory }),
    [dailyByDate, dailyHistory, dailyTemplates],
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
    () => ({ annotationStrokes, workstationTaskIds, highlightColor, annotationImport }),
    [annotationStrokes, highlightColor, workstationTaskIds, annotationImport],
  );
  const surfaceActions = useMemo(
    () => ({
      updateAnnotationStrokes,
      updateWorkstationTaskIds,
      updateHighlightColor,
      runWorkstationCommand,
    }),
    [
      updateAnnotationStrokes,
      updateHighlightColor,
      updateWorkstationTaskIds,
      runWorkstationCommand,
    ],
  );
  /** 实际录入复用每任务队列与旧草稿冲突保护；确认后刷新按日账本。 */
  const recordTaskActual = useCallback(
    async (
      original: Task,
      minutes: number | undefined,
      date: string,
      complete = false,
    ) => {
      const saved = await commitTask(
        original.id,
        (current) => ({
          ...current,
          actualDurationMinutes: minutes,
          ...(complete ? { completed: true } : {}),
        }),
        () => repository.recordTaskActual(original, minutes, date, complete),
        original,
      );
      void queryClient.invalidateQueries({
        queryKey: ['workspace', ownerKey, 'task-time-entries'],
        exact: true,
      });
      return saved;
    },
    [commitTask, repository, queryClient, ownerKey],
  );
  const commands = useMemo(
    () => ({
      createProject,
      updateProject,
      setProjectArchived,
      deleteProject,
      createTask,
      saveTaskConfirmed,
      recordTaskActual,
      createDailyTemplate,
      saveDailyTemplate,
      saveDailyEntry,
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
      deleteProject,
      createTask,
      saveTaskConfirmed,
      recordTaskActual,
      createDailyTemplate,
      recordDaily,
      saveDailyTemplate,
      saveDailyEntry,
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
      notice={
        <>
          <TaskConflictDrafts
            drafts={conflictedDrafts}
            tasks={tasksQuery.data ?? []}
            projects={projects}
            onDismiss={dismissConflict}
          />
          {(mutationError ||
            annotationImport.error ||
            queryError ||
            startupProgress?.realtime.status === 'failed') && (
            <p className="workspace-sync-error" role="alert">
              {mutationError ??
                annotationImport.error ??
                (queryError instanceof Error ? queryError.message : undefined) ??
                startupProgress?.realtime.message ??
                '云工作区载入失败'}
              {queryError && (
                <button type="button" onClick={() => void invalidateWorkspace()}>
                  重试同步
                </button>
              )}
            </p>
          )}
        </>
      }
    >
      {children}
    </WorkspaceContextProviders>
  );
}

/** 仅 Preview 演示或显式测试使用本地数据；普通云运行时不会自动回退。 */
export function WorkspaceDataProvider({ children }: { children: ReactNode }) {
  return usesLocalWorkspace() ? (
    <LocalWorkspaceTestAdapter>{children}</LocalWorkspaceTestAdapter>
  ) : (
    <CloudWorkspaceDataProvider>{children}</CloudWorkspaceDataProvider>
  );
}
