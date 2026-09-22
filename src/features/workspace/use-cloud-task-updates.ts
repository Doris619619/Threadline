/** @fileoverview 让云端任务字段立即反馈，按任务串行保存，并隔离同步刷新与失败回滚。 */

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import { isCancelledError, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';
import type { Task } from '@/types/domain';
import {
  isTaskConflict,
  TaskConflictError,
  taskFieldChanges,
  type TaskConflictDraft,
} from '@/lib/task-patch';
import { beginCloudWrite } from '@/lib/cloud-write-guard';

type TaskRepository = Pick<
  SupabaseWorkspaceRepository,
  'listTasks' | 'restoreTask' | 'updateTaskFields' | 'listTaskTimeEntries'
>;
type PendingTask = {
  original: Task | undefined;
  blocked?: boolean;
  latest: Task;
  confirmed: Task | undefined;
  tail: Promise<void>;
};

/** 合并尚未确认的用户意图，保留其他任务的服务器刷新结果。 */
function overlayTasks(rows: Task[], pending: Map<string, Task>): Task[] {
  const result = rows.map((task) => pending.get(task.id) ?? task);
  for (const [id, task] of pending) {
    if (!rows.some((row) => row.id === id)) result.push(task);
  }
  return result;
}

/** 普通字段走即时反馈；同一任务按点击顺序写入，复合流转仍交给原有数据库命令。 */
export function useCloudTaskUpdates(
  ownerKey: string,
  repository: TaskRepository,
  onError: (message: string | undefined) => void,
) {
  const queryClient = useQueryClient();
  const scope = useMemo(
    () => ({
      key: ['workspace', ownerKey, 'tasks'],
      repository,
      pending: new Map<string, PendingTask>(),
      conflicts: new Map<string, TaskConflictDraft>(),
    }),
    [ownerKey, repository],
  );
  const [optimistic, setOptimistic] = useState<{
    scope: typeof scope;
    rows: Map<string, Task>;
    conflicts: TaskConflictDraft[];
  }>();
  const activeScope = useRef<typeof scope | undefined>(scope);
  useLayoutEffect(() => {
    activeScope.current = scope;
    return () => {
      if (activeScope.current === scope) activeScope.current = undefined;
    };
  }, [scope]);
  const query = useQuery({
    queryKey: scope.key,
    queryFn: ({ signal }) => repository.listTasks(signal),
  });
  const tasks = useMemo(
    () =>
      overlayTasks(
        queryClient.getQueryData<Task[]>(scope.key) ?? query.data ?? [],
        optimistic?.scope === scope ? optimistic.rows : new Map(),
      ),
    [optimistic, query.data, queryClient, scope],
  );

  /** 同步发布 React 状态，受控复选框无需等待网络或 Query 的批量通知。 */
  const publishPending = useCallback(() => {
    if (activeScope.current !== scope) return;
    setOptimistic({
      scope,
      rows: new Map([...scope.pending].map(([id, entry]) => [id, entry.latest])),
      conflicts: [...scope.conflicts.values()],
    });
  }, [scope]);

  /** 已冲突的这一轮队列永不自动恢复；保留最后草稿供用户查看，新的编辑另建基准。 */
  const stopConflictedQueue = useCallback(
    (entry: PendingTask) => {
      entry.blocked = true;
      if (entry.original)
        scope.conflicts.set(entry.latest.id, {
          original: entry.original,
          draft: entry.latest,
        });
    },
    [scope],
  );

  /** 只在用户主动处理完草稿后移除提示，不执行任何远端写入。 */
  const dismissConflict = useCallback(
    (id: string) => {
      scope.conflicts.delete(id);
      publishPending();
    },
    [publishPending, scope],
  );

  /** 已提交的任务不受账本读取失败影响；实际投入仍只使用服务器账本。 */
  const refreshTimeEntries = useCallback(async () => {
    try {
      await queryClient.cancelQueries({
        queryKey: ['workspace', ownerKey, 'task-time-entries'],
        exact: true,
      });
      if (activeScope.current !== scope) return;
      await queryClient.fetchQuery({
        queryKey: ['workspace', ownerKey, 'task-time-entries'],
        queryFn: ({ signal }) => repository.listTaskTimeEntries(signal),
        staleTime: 0,
      });
    } catch (error) {
      if (activeScope.current === scope && !isCancelledError(error)) {
        onError('任务已保存，但耗时同步失败，请刷新后重试。');
      }
    }
  }, [onError, ownerKey, queryClient, repository, scope]);

  /** 只回写当前任务，避免较早的整表快照覆盖其他任务；失败恢复最后一次已确认值。 */
  const save = useCallback(
    async (task: Task, previous: Task | undefined, entry: PendingTask) => {
      if (entry.blocked) return;
      let committed = false;
      try {
        if (activeScope.current !== scope) return;
        if (!previous || !entry.confirmed) throw new Error('任务不存在，请重新加载。');
        const patch = taskFieldChanges(task, previous);
        entry.confirmed =
          task.status === 'active' &&
          (previous.status === 'trashed' || previous.status === 'abandoned') &&
          task.date
            ? await repository.restoreTask(task.id, task.date, entry.confirmed)
            : await repository.updateTaskFields(task.id, patch, entry.confirmed);
        committed = true;
      } catch (error) {
        if (activeScope.current !== scope) return;
        if (isTaskConflict(error)) stopConflictedQueue(entry);
        try {
          entry.confirmed = (await repository.listTasks()).find(
            (row) => row.id === task.id,
          );
        } catch {
          /* 读取失败保留最后确认值，下一次操作仍由字段冲突保护。 */
        }
        if (activeScope.current !== scope) return;
        onError(
          `任务保存失败，请重试：${error instanceof Error ? error.message : '云端写入失败'}`,
        );
      }
      if (activeScope.current !== scope) return;
      await queryClient.cancelQueries({ queryKey: scope.key, exact: true });
      if (activeScope.current !== scope) return;
      if (entry.latest === task || entry.blocked) {
        if (entry.blocked) stopConflictedQueue(entry);
        const confirmed = entry.confirmed;
        queryClient.setQueryData<Task[]>(scope.key, (current = []) =>
          confirmed
            ? overlayTasks(current, new Map([[task.id, confirmed]]))
            : current.filter((row) => row.id !== task.id),
        );
        scope.pending.delete(task.id);
        publishPending();
      }
      if (committed) void refreshTimeEntries();
    },
    [
      onError,
      publishPending,
      queryClient,
      refreshTimeEntries,
      repository,
      scope,
      stopConflictedQueue,
    ],
  );

  /** 离线立即拒绝；在线合并缓存与待保存意图后计算更新，不丢失连续点击。 */
  const updateTasks = useCallback(
    (action: SetStateAction<Task[]>) => {
      if (activeScope.current !== scope) return;
      if (!navigator.onLine) {
        onError('当前离线，任务未保存，请联网后重试。');
        return;
      }
      onError(undefined);
      const current = overlayTasks(
        queryClient.getQueryData<Task[]>(scope.key) ?? [],
        new Map([...scope.pending].map(([id, entry]) => [id, entry.latest])),
      );
      const next = typeof action === 'function' ? action(current) : action;
      for (const task of next) {
        const previous = current.find((row) => row.id === task.id);
        if (JSON.stringify(previous) === JSON.stringify(task)) continue;
        let endWrite: () => void;
        try {
          endWrite = beginCloudWrite();
        } catch (error) {
          onError(error instanceof Error ? error.message : '正在更新，请稍后再保存。');
          return;
        }
        const entry = scope.pending.get(task.id) ?? {
          original: previous,
          latest: task,
          confirmed: previous,
          tail: Promise.resolve(),
        };
        entry.latest = task;
        scope.pending.set(task.id, entry);
        entry.tail = entry.tail
          .then(() => save(task, previous, entry))
          .finally(endWrite);
      }
      publishPending();
    },
    [onError, publishPending, queryClient, save, scope],
  );

  /** 原子命令与普通编辑共用每任务队列；立即展示意图，失败恢复最后确认值。 */
  const commitTask = useCallback(
    (
      taskId: string,
      preview: (task: Task) => Task,
      operation: (confirmed: Task) => Promise<Task>,
      original?: Task,
    ) => {
      if (!navigator.onLine) return Promise.reject(new Error('当前离线，任务未保存。'));
      const previous =
        scope.pending.get(taskId)?.latest ??
        queryClient.getQueryData<Task[]>(scope.key)?.find((task) => task.id === taskId);
      if (!previous) return Promise.reject(new Error('未找到任务，请刷新后重试。'));
      const next = preview(previous);
      const endWrite = beginCloudWrite();
      const entry = scope.pending.get(taskId) ?? {
        original: original ?? previous,
        latest: next,
        confirmed: previous,
        tail: Promise.resolve(),
      };
      entry.latest = next;
      scope.pending.set(taskId, entry);
      onError(undefined);
      publishPending();
      const result = entry.tail.then(async () => {
        if (entry.blocked) {
          endWrite();
          throw new TaskConflictError();
        }
        try {
          if (activeScope.current !== scope || !entry.confirmed)
            throw new Error('账号会话已改变，请重新操作。');
          const saved = await operation(entry.confirmed);
          entry.confirmed = saved;
          return saved;
        } catch (error) {
          if (activeScope.current === scope) {
            if (isTaskConflict(error)) stopConflictedQueue(entry);
            try {
              entry.confirmed = (await repository.listTasks()).find(
                (row) => row.id === taskId,
              );
            } catch {
              /* 失败保留确认状态。 */
            }
          }
          if (activeScope.current === scope)
            onError(error instanceof Error ? error.message : '任务操作失败，请重试。');
          throw error;
        } finally {
          await queryClient.cancelQueries({ queryKey: scope.key, exact: true });
          if (
            activeScope.current === scope &&
            (entry.latest === next || entry.blocked)
          ) {
            if (entry.blocked) stopConflictedQueue(entry);
            const confirmed = entry.confirmed;
            queryClient.setQueryData<Task[]>(scope.key, (rows = []) =>
              confirmed
                ? overlayTasks(rows, new Map([[taskId, confirmed]]))
                : rows.filter((row) => row.id !== taskId),
            );
            scope.pending.delete(taskId);
            publishPending();
          }
          endWrite();
        }
      });
      // 调用者仍收到失败；字段冲突通过 entry.blocked 拒绝这一轮尚未发送的命令。
      entry.tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    [onError, publishPending, queryClient, repository, scope, stopConflictedQueue],
  );

  /** 表单保留打开时基准，冲突由调用者展示且不关闭草稿；与行内和流转共用队列。 */
  const saveTaskConfirmed = useCallback(
    (task: Task, original?: Task) => {
      const previous =
        original ??
        scope.pending.get(task.id)?.latest ??
        queryClient.getQueryData<Task[]>(scope.key)?.find((row) => row.id === task.id);
      if (!previous) return Promise.reject(new Error('任务不存在，请重新加载。'));
      const patch = taskFieldChanges(task, previous);
      return commitTask(
        task.id,
        (current) => ({ ...current, ...patch }),
        () => repository.updateTaskFields(task.id, patch, previous),
        previous,
      );
    },
    [commitTask, queryClient, repository, scope],
  );
  return {
    query,
    tasks,
    updateTasks,
    commitTask,
    saveTaskConfirmed,
    dismissConflict,
    conflictedDrafts: optimistic?.scope === scope ? optimistic.conflicts : [],
  };
}
