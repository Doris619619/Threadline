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
import { useOptionalStartupProgress } from '@/features/startup/startup-progress-context';
import {
  WorkspaceContextProviders,
  type CloseAction,
  type TaskTransition,
} from '@/features/workspace/workspace-data-context';
export { useWorkspaceData } from '@/features/workspace/workspace-data-context';
import { LocalWorkspaceTestAdapter } from '@/features/workspace/workspace-test-adapter';
import { useCloudTaskUpdates } from '@/features/workspace/use-cloud-task-updates';
import { usesLocalWorkspace } from '@/lib/workspace-runtime';
import { useAnnotationStrokes } from '@/hooks/use-annotation-strokes';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { reconcileTaskAnnotations } from '@/lib/annotation-reconciliation';
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
  const [annotationStrokes, updateAnnotationStrokes, annotationHydrated] =
    useAnnotationStrokes();
  const [highlightColor, updateHighlightColor, highlightHydrated] =
    usePersistentState<string>(
      'threadline.annotation-highlight-color.v1',
      'rgba(255, 225, 53, 0.42)',
    );

  const projectsQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'projects'],
    queryFn: () => repository.listProjects(),
  });
  const {
    query: tasksQuery,
    tasks,
    updateTasks,
  } = useCloudTaskUpdates(ownerKey, repository, setMutationError);
  const taskTimeEntriesQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'task-time-entries'],
    queryFn: () => repository.listTaskTimeEntries(),
  });
  const dailyQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'daily'],
    queryFn: () => repository.listDailyBundle(),
  });
  const dailyHistoryQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'daily-history'],
    queryFn: () => repository.listDailyHistory(),
  });
  const historyQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'history'],
    queryFn: () => repository.listHistory(),
  });
  const closeRecordsQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'close-records'],
    queryFn: () => repository.listCloseRecords(),
  });
  const workstationQuery = useQuery({
    queryKey: ['workspace', ownerKey, 'workstation'],
    queryFn: () => repository.listWorkstationTaskIds(),
  });

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
  const workstationTaskIds = useMemo(
    () => workstationQuery.data ?? [],
    [workstationQuery.data],
  );

  /** 拒绝离线写并把失败暴露到页面；第一版不建立离线队列。 */
  const runMutation = useCallback(async (operation: () => Promise<void>) => {
    if (!navigator.onLine) {
      setMutationError('当前离线。Threadline 第一版不会排队写入，请联网后重试。');
      return;
    }
    setMutationError(undefined);
    try {
      await operation();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : '云端写入失败');
    }
  }, []);

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
        setMutationError(error instanceof Error ? error.message : 'Daily 实例化失败'),
      );
  }, [
    dailyByDate,
    dailyQuery.isSuccess,
    ownerKey,
    queryClient,
    repository,
    selectedDate,
  ]);

  useEffect(() => {
    if (!tasksQuery.isSuccess) return;
    updateAnnotationStrokes((current) => reconcileTaskAnnotations(current, tasks));
  }, [tasks, tasksQuery.isSuccess, updateAnnotationStrokes]);

  useEffect(() => {
    const invalidate = () => void invalidateWorkspace();
    const tables = [
      'projects',
      'tasks',
      'task_time_entries',
      'daily_templates',
      'daily_template_items',
      'daily_entries',
      'daily_entry_items',
      'workstation_entries',
      'rhythm_marks',
      'daily_history_entries',
      'history_events',
      'daily_close_records',
    ];
    let active = true;
    let channel = client.channel(`workspace:${ownerKey}`);
    for (const table of tables) {
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
      void client.removeChannel(channel);
    };
  }, [client, invalidateWorkspace, ownerKey, setRealtimeStatus]);

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
      setMutationError('每日收尾必须通过 closeDay 原子命令提交。');
    }, []);

  const updateWorkstationTaskIds: Dispatch<SetStateAction<string[]>> = useCallback(
    (action) => {
      void runMutation(async () => {
        const current = workstationTaskIds;
        const next = [...new Set(resolveState(current, action))];
        const currentSet = new Set(current);
        const nextSet = new Set(next);
        for (const taskId of next.filter((id) => !currentSet.has(id)))
          await repository.addWorkstationTask(taskId);
        for (const taskId of current.filter((id) => !nextSet.has(id)))
          await repository.removeWorkstationTask(taskId);
        await repository.reorderWorkstation(next);
        queryClient.setQueryData(['workspace', ownerKey, 'workstation'], next);
      });
    },
    [ownerKey, queryClient, repository, runMutation, workstationTaskIds],
  );

  /** 顺序创建可能刚新建的项目、task 与 created history，避免 FK 写入竞态。 */
  const createTask = useCallback(
    async (task: Task) => {
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法创建任务。');
        setMutationError(undefined);
        const project = projects.find((item) => item.id === task.projectId);
        if (!project) throw new Error('任务项目不存在。');
        if (!project.updatedAt) {
          const savedProject = await repository.saveProject(project);
          queryClient.setQueryData<Project[]>(
            ['workspace', ownerKey, 'projects'],
            (current = []) =>
              current.map((item) =>
                item.id === savedProject.id ? savedProject : item,
              ),
          );
        }
        const savedTask = await repository.saveTask(task);
        await repository.appendHistory(
          {
            id: crypto.randomUUID(),
            taskId: savedTask.id,
            type: 'created',
            occurredAt: new Date().toISOString(),
            payload: { title: savedTask.title },
          },
          savedTask,
        );
        queryClient.setQueryData<Task[]>(
          ['workspace', ownerKey, 'tasks'],
          (current = []) => [...current, savedTask],
        );
        await queryClient.invalidateQueries({
          queryKey: ['workspace', ownerKey, 'history'],
        });
        return savedTask;
      } catch (error) {
        setMutationError(error instanceof Error ? error.message : '任务创建失败');
        throw error;
      }
    },
    [ownerKey, projects, queryClient, repository],
  );

  const transitionTask = useCallback(
    async (taskId: string, transition: TaskTransition, targetDate?: string) => {
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法提交任务流转。');
        setMutationError(undefined);
        const task = await repository.transitionTask(taskId, transition, targetDate);
        queryClient.setQueryData<Task[]>(
          ['workspace', ownerKey, 'tasks'],
          (current = []) => current.map((item) => (item.id === task.id ? task : item)),
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
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['workspace', ownerKey, 'history'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['workspace', ownerKey, 'workstation'],
          }),
        ]);
        return task;
      } catch (error) {
        setMutationError(error instanceof Error ? error.message : '任务流转失败');
        throw error;
      }
    },
    [ownerKey, queryClient, repository, updateAnnotationStrokes],
  );

  /** 完成待安排任务时由数据库先补齐本地业务日，再触发完成历史写入。 */
  const completeWaitingTask = useCallback(
    async (taskId: string, completedDate: string) => {
      if (!navigator.onLine) throw new Error('当前离线，无法完成待安排任务。');
      const task = await repository.completeWaitingTask(taskId, completedDate);
      queryClient.setQueryData<Task[]>(
        ['workspace', ownerKey, 'tasks'],
        (current = []) => current.map((item) => (item.id === task.id ? task : item)),
      );
      await queryClient.invalidateQueries({
        queryKey: ['workspace', ownerKey, 'history'],
      });
      return task;
    },
    [ownerKey, queryClient, repository],
  );

  const recordDaily = useCallback(
    async (
      templateId: string,
      date: string,
      source: 'manual' | 'close_day' = 'manual',
    ) => {
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法记录 Daily。');
        setMutationError(undefined);
        await repository.recordDaily(templateId, date, source);
        await queryClient.invalidateQueries({
          queryKey: ['workspace', ownerKey, 'daily-history'],
        });
      } catch (error) {
        setMutationError(error instanceof Error ? error.message : 'Daily 记录失败');
        throw error;
      }
    },
    [ownerKey, queryClient, repository],
  );

  const closeDay = useCallback(
    async (
      date: string,
      actions: CloseAction[],
      projectMinutes: Record<string, number>,
    ) => {
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法完成每日收尾。');
        setMutationError(undefined);
        await repository.closeDay(date, actions, projectMinutes);
        await invalidateWorkspace();
      } catch (error) {
        setMutationError(error instanceof Error ? error.message : '每日收尾失败');
        throw error;
      }
    },
    [invalidateWorkspace, repository],
  );

  const hydrated =
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
    if (queryError) {
      setWorkspaceDataStatus({
        status: 'failed',
        message:
          queryError instanceof Error ? queryError.message : '云工作区数据载入失败',
      });
      return;
    }
    setWorkspaceDataStatus({ status: hydrated ? 'completed' : 'active' });
  }, [hydrated, queryError, setWorkspaceDataStatus]);

  const taskState = useMemo(
    () => ({ tasks, taskTimeEntries, taskTimeEntriesAuthoritative: true }),
    [tasks, taskTimeEntries],
  );

  /** 先等待 server-confirmed project，再让调用方使用其 ID 创建或改派任务。 */
  const createProject = useCallback(
    async (project: Project) => {
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法创建项目。');
        setMutationError(undefined);
        const saved = await repository.saveProject(project);
        queryClient.setQueryData<Project[]>(
          ['workspace', ownerKey, 'projects'],
          (current = []) => [...current.filter((item) => item.id !== saved.id), saved],
        );
        return saved;
      } catch (error) {
        setMutationError(error instanceof Error ? error.message : '项目创建失败');
        throw error;
      }
    },
    [ownerKey, queryClient, repository],
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

  /** 区分 RPC 写入失败与提交后刷新失败，避免诱导用户重复写入已保存的模板。 */
  const saveDailyTemplate = useCallback(
    async (daily: Daily) => {
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法保存 Daily 模板。');
        setMutationError(undefined);
        await repository.updateDailyTemplate(daily);
      } catch (error) {
        setMutationError(error instanceof Error ? error.message : 'Daily 模板保存失败');
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
        setMutationError,
      );
    },
    [ownerKey, queryClient, repository],
  );
  /** 原子创建模板和当前日期 entry，成功后刷新完整 Daily bundle。 */
  const createDailyTemplate = useCallback(
    async (daily: Daily) => {
      try {
        if (!navigator.onLine) throw new Error('当前离线，无法创建 Daily 模板。');
        setMutationError(undefined);
        await repository.createDailyTemplate(daily, selectedDate);
      } catch (error) {
        setMutationError(error instanceof Error ? error.message : 'Daily 模板创建失败');
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
        setMutationError,
      );
    },
    [ownerKey, queryClient, repository, selectedDate],
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
    () => ({ annotationStrokes, workstationTaskIds, highlightColor }),
    [annotationStrokes, highlightColor, workstationTaskIds],
  );
  const surfaceActions = useMemo(
    () => ({ updateAnnotationStrokes, updateWorkstationTaskIds, updateHighlightColor }),
    [updateAnnotationStrokes, updateHighlightColor, updateWorkstationTaskIds],
  );
  const commands = useMemo(
    () => ({
      createProject,
      updateProject,
      setProjectArchived,
      deleteProject,
      createTask,
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
        (mutationError ||
          queryError ||
          startupProgress?.realtime.status === 'failed') && (
          <p className="workspace-sync-error" role="alert">
            {mutationError ??
              (queryError instanceof Error ? queryError.message : undefined) ??
              startupProgress?.realtime.message ??
              '云工作区载入失败'}
          </p>
        )
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
