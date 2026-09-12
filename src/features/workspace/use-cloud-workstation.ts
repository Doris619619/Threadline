/** @fileoverview 工作站成员立即反馈、串行落库，并用待保存意图隔离后台旧读。 */
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { beginCloudWrite } from '@/lib/cloud-write-guard';
import type { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';

type Repository = Pick<
  SupabaseWorkspaceRepository,
  | 'listWorkstationTaskIds'
  | 'addWorkstationTask'
  | 'removeWorkstationTasks'
  | 'reorderWorkstation'
>;

/** 保留每次点击的完整顺序；失败重新读取服务端，后续操作仍按用户最新意图执行。 */
export function useCloudWorkstation(
  ownerKey: string,
  repository: Repository,
  onError: (message: string | undefined) => void,
) {
  const client = useQueryClient();
  const scope = useMemo(
    () => ({
      key: ['workspace', ownerKey, 'workstation'],
      repository,
      queue: new Map<
        string,
        { tail: Promise<void>; revision: number; pending: number; latest: string[] }
      >(),
    }),
    [ownerKey, repository],
  );
  const [optimistic, setOptimistic] = useState<{
    scope: typeof scope;
    ids: string[];
  }>();
  const activeScope = useRef(scope);
  useLayoutEffect(() => {
    activeScope.current = scope;
  }, [scope]);
  const query = useQuery({
    queryKey: scope.key,
    queryFn: () => repository.listWorkstationTaskIds(),
  });
  const ids =
    optimistic?.scope === scope && (scope.queue.get('active')?.pending ?? 0) > 0
      ? optimistic.ids
      : (client.getQueryData<string[]>(scope.key) ?? query.data ?? []);

  /** 同步显示清空/增删结果，写入前计入重启保护，不等待网络往返。 */
  const update = useCallback(
    (action: SetStateAction<string[]>) => {
      if (!navigator.onLine) {
        onError('当前离线，工作站未保存，请联网后重试。');
        return;
      }
      let endWrite: () => void;
      try {
        endWrite = beginCloudWrite();
      } catch (error) {
        onError((error as Error).message);
        return;
      }
      const queue = scope.queue.get('active') ?? {
        tail: Promise.resolve(),
        revision: 0,
        pending: 0,
        latest: [],
      };
      scope.queue.set('active', queue);
      const current = queue.pending
        ? queue.latest
        : (client.getQueryData<string[]>(scope.key) ?? []);
      const next = [
        ...new Set(typeof action === 'function' ? action(current) : action),
      ];
      queue.latest = next;
      queue.pending++;
      const revision = ++queue.revision;
      setOptimistic({ scope, ids: next });
      onError(undefined);
      void client.cancelQueries({ queryKey: scope.key, exact: true });
      /** 串行协调完整成员集合；批量移除避免清空耗时随任务数线性增加。 */
      const save = async () => {
        let confirmed = client.getQueryData<string[]>(scope.key) ?? [];
        try {
          confirmed = await repository.listWorkstationTaskIds();
          for (const id of next.filter((id) => !confirmed.includes(id)))
            await repository.addWorkstationTask(id);
          const removed = confirmed.filter((id) => !next.includes(id));
          if (removed.length) await repository.removeWorkstationTasks(removed);
          if (next.length) await repository.reorderWorkstation(next);
          confirmed = next;
        } catch (error) {
          onError(
            `工作站保存失败，请重试：${error instanceof Error ? error.message : '云端写入失败'}`,
          );
          try {
            confirmed = await repository.listWorkstationTaskIds();
          } catch {
            /* 保留最后已知集合供重试。 */
          }
        } finally {
          await client.cancelQueries({ queryKey: scope.key, exact: true });
          client.setQueryData(scope.key, confirmed);
          queue.pending--;
          if (activeScope.current === scope && queue.revision === revision)
            setOptimistic({ scope, ids: confirmed });
          endWrite();
        }
      };
      queue.tail = queue.tail.then(save, save);
    },
    [client, onError, repository, scope],
  );
  return { query, workstationTaskIds: ids, updateWorkstationTaskIds: update };
}
