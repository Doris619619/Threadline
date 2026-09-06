/** @fileoverview 让云端任务字段立即反馈，按任务串行保存，并隔离同步刷新与失败回滚。 */

import { useCallback, useMemo, useState, type SetStateAction } from 'react';
import { isCancelledError, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';
import type { Task } from '@/types/domain';

type TaskRepository = Pick<
  SupabaseWorkspaceRepository,
  'listTasks' | 'saveTask' | 'listTaskTimeEntries'
>;
type PendingTask = {
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
    }),
    [ownerKey, repository],
  );
  const [optimistic, setOptimistic] = useState<{
    scope: typeof scope;
    rows: Map<string, Task>;
  }>();
  const query = useQuery({
    queryKey: scope.key,
    queryFn: () => repository.listTasks(),
  });
  const tasks = useMemo(
    () =>
      overlayTasks(
        query.data ?? [],
        optimistic?.scope === scope ? optimistic.rows : new Map(),
      ),
    [optimistic, query.data, scope],
  );

  /** 同步发布 React 状态，受控复选框无需等待网络或 Query 的批量通知。 */
  const publishPending = useCallback(() => {
    setOptimistic({
      scope,
      rows: new Map([...scope.pending].map(([id, entry]) => [id, entry.latest])),
    });
  }, [scope]);

  /** 已提交的任务不受账本读取失败影响；实际投入仍只使用服务器账本。 */
  const refreshTimeEntries = useCallback(async () => {
    try {
      await queryClient.cancelQueries({
        queryKey: ['workspace', ownerKey, 'task-time-entries'],
        exact: true,
      });
      await queryClient.fetchQuery({
        queryKey: ['workspace', ownerKey, 'task-time-entries'],
        queryFn: () => repository.listTaskTimeEntries(),
        staleTime: 0,
      });
    } catch (error) {
      if (!isCancelledError(error)) {
        onError('任务已保存，但耗时同步失败，请刷新后重试。');
      }
    }
  }, [onError, ownerKey, queryClient, repository]);

  /** 只回写当前任务，避免较早的整表快照覆盖其他任务；失败恢复最后一次已确认值。 */
  const save = useCallback(
    async (task: Task, entry: PendingTask) => {
      let committed = false;
      try {
        entry.confirmed = await repository.saveTask(task);
        committed = true;
      } catch (error) {
        onError(
          `任务保存失败，请重试：${error instanceof Error ? error.message : '云端写入失败'}`,
        );
      }
      await queryClient.cancelQueries({ queryKey: scope.key, exact: true });
      if (entry.latest === task) {
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
    [onError, publishPending, queryClient, refreshTimeEntries, repository, scope],
  );

  /** 离线立即拒绝；在线合并缓存与待保存意图后计算更新，不丢失连续点击。 */
  const updateTasks = useCallback(
    (action: SetStateAction<Task[]>) => {
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
        const entry = scope.pending.get(task.id) ?? {
          latest: task,
          confirmed: previous,
          tail: Promise.resolve(),
        };
        entry.latest = task;
        scope.pending.set(task.id, entry);
        entry.tail = entry.tail.then(() => save(task, entry));
      }
      publishPending();
    },
    [onError, publishPending, queryClient, save, scope],
  );

  return { query, tasks, updateTasks };
}
