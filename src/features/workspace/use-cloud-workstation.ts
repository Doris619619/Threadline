/** @fileoverview 工作站显式命令串行落库，失败读取真实集合，旧会话队列停止发送。 */
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
import {
  previewWorkstationCommand,
  type WorkstationCommand,
} from '@/lib/workstation-command';
import type { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';
type Repository = Pick<
  SupabaseWorkspaceRepository,
  'listWorkstationTaskIds' | 'applyWorkstationCommand'
>;
/** 点击时记录真实意图和可见集合，异步执行不重新解释成服务器集合替换。 */
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
      queue: new Map([
        ['active', { tail: Promise.resolve(), pending: [] as WorkstationCommand[] }],
      ]),
    }),
    [ownerKey, repository],
  );
  const activeScope = useRef<typeof scope | undefined>(scope);
  const [optimistic, setOptimistic] = useState<{
    scope: typeof scope;
    ids: string[];
  }>();
  useLayoutEffect(() => {
    activeScope.current = scope;
    return () => {
      if (activeScope.current === scope) activeScope.current = undefined;
    };
  }, [scope]);
  const query = useQuery({
    queryKey: scope.key,
    queryFn: ({ signal }) => repository.listWorkstationTaskIds(signal),
  });
  const ids =
    optimistic?.scope === scope && scope.queue.get('active')!.pending.length
      ? optimistic.ids
      : (query.data ?? []);
  /** 每条命令只更新自己的成员；失败不会发送相反命令伪造回滚。 */
  const runWorkstationCommand = useCallback(
    (command: WorkstationCommand) => {
      const queue = scope.queue.get('active')!;
      if (activeScope.current !== scope) return;
      if (!navigator.onLine) {
        onError('当前离线，工作站未保存，请联网后重试。');
        return;
      }
      let endWrite: () => void;
      try {
        endWrite = beginCloudWrite();
      } catch (error) {
        onError(String(error));
        return;
      }
      queue.pending.push(command);
      const publish = () => {
        if (activeScope.current === scope)
          setOptimistic({
            scope,
            ids: queue.pending.reduce(
              previewWorkstationCommand,
              client.getQueryData<string[]>(scope.key) ?? [],
            ),
          });
      };
      publish();
      onError(undefined);
      void client.cancelQueries({ queryKey: scope.key, exact: true });
      const save = async () => {
        try {
          if (activeScope.current !== scope) return;
          let confirmed: string[];
          try {
            confirmed = await repository.applyWorkstationCommand(command);
          } catch (error) {
            if (activeScope.current !== scope) return;
            onError(`工作站保存失败，请重试：${String(error)}`);
            confirmed = await repository.listWorkstationTaskIds();
          }
          if (activeScope.current !== scope) return;
          await client.cancelQueries({ queryKey: scope.key, exact: true });
          client.setQueryData(scope.key, confirmed);
        } catch (error) {
          if (activeScope.current === scope)
            onError(`工作站同步失败，已保留最后确认数据：${String(error)}`);
        } finally {
          queue.pending.shift();
          publish();
          endWrite();
        }
      };
      queue.tail = queue.tail.then(save, save);
    },
    [client, onError, repository, scope],
  );
  /** 旧 UI setter 仅转换调用时可见成员的增删，不把服务器新增成员解释为待删除。 */
  const updateWorkstationTaskIds = useCallback(
    (action: SetStateAction<string[]>) => {
      const queue = scope.queue.get('active')!;
      const current = queue.pending.reduce(
        previewWorkstationCommand,
        client.getQueryData<string[]>(scope.key) ?? [],
      );
      const next = [
        ...new Set(typeof action === 'function' ? action(current) : action),
      ];
      const removed = current.filter((id) => !next.includes(id));
      if (removed.length) runWorkstationCommand({ type: 'clear', ids: removed });
      for (const id of next.filter((id) => !current.includes(id)))
        runWorkstationCommand({ type: 'add', id });
    },
    [client, runWorkstationCommand, scope],
  );
  return {
    query,
    workstationTaskIds: ids,
    updateWorkstationTaskIds,
    runWorkstationCommand,
  };
}
