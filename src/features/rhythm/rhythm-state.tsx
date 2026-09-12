/** @fileoverview 独立生理期状态：云端 RLS/Realtime 与 Preview 适配器共享校验和异步操作契约。 */
'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { useLocalPeriodState } from './use-local-period-state';
import { usesLocalWorkspace } from '@/lib/workspace-runtime';
import { getLocalDateKey } from '@/lib/local-date';
import { validatePeriod, type PeriodDraft, type PeriodRecord } from './period-rules';
import { listPeriods, savePeriod, deletePeriod } from './period-repository';

type RhythmContext = {
  marks: Record<string, boolean>;
  periods: PeriodRecord[];
  loading: boolean;
  error?: string;
  save: (draft: PeriodDraft) => Promise<void>;
  remove: (id: string) => Promise<void>;
  retry: () => void;
};
const Context = createContext<RhythmContext | null>(null);

/** 云端读取失败不伪装空数据；直接采用保存结果，Realtime 仅使账号查询失效。 */
function CloudRhythmStateProvider({ children }: { children: ReactNode }) {
  const { client, repository, user } = useCloudRuntime();
  const queryClient = useQueryClient();
  const key = ['rhythm', user.id];
  const query = useQuery({
    queryKey: key,
    networkMode: 'always',
    queryFn: async () => {
      if (!navigator.onLine) throw new Error('当前离线，无法读取记录，请联网后重试');
      const [marks, periods] = await Promise.all([
        repository.listRhythmMarks(),
        listPeriods(client),
      ]);
      return { marks, periods };
    },
  });
  const mutation = useMutation({
    // 离线时立即报告错误并保留表单，不能让 React Query 将操作无限暂停在“保存中”。
    networkMode: 'always',
    mutationFn: async (action: { draft: PeriodDraft } | { id: string }) => {
      if (!navigator.onLine) throw new Error('当前离线，输入已保留，请联网后重试');
      if ('draft' in action) {
        validatePeriod(action.draft, query.data?.periods ?? [], getLocalDateKey());
        const saved = await savePeriod(
          client,
          action.draft,
          Boolean(query.data?.periods.some((p) => p.id === action.draft.id)),
        );
        return { saved };
      } else {
        await deletePeriod(client, action.id);
        return { deletedId: action.id };
      }
    },
    onSuccess: async (result) => {
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.setQueryData<{
        marks: Record<string, boolean>;
        periods: PeriodRecord[];
      }>(key, (current) => {
        if (!current) return current;
        const periods = current.periods.filter(
          (period) => period.id !== (result.saved?.id ?? result.deletedId),
        );
        if (result.saved) periods.push(result.saved);
        return {
          ...current,
          periods: periods.sort((a, b) => b.startDate.localeCompare(a.startDate)),
        };
      });
    },
  });
  useEffect(() => {
    const channel = client.channel(`periods:${user.id}`);
    for (const table of ['period_records', 'rhythm_marks'])
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `owner_id=eq.${user.id}` },
        () => void queryClient.invalidateQueries({ queryKey: ['rhythm', user.id] }),
      );
    channel.subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [client, queryClient, user.id]);
  return (
    <Context.Provider
      value={{
        marks: query.data?.marks ?? {},
        periods: query.data?.periods ?? [],
        loading: query.isPending,
        error: query.error?.message,
        save: async (draft) => {
          await mutation.mutateAsync({ draft });
        },
        remove: async (id) => {
          await mutation.mutateAsync({ id });
        },
        retry: () => {
          void query.refetch();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

/** Preview 保留旧标记键，新记录使用独立键，更新前执行与云端相同的日期规则。 */
function LocalRhythmTestAdapter({ children }: { children: ReactNode }) {
  const state = useLocalPeriodState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

/** 生产只使用云端；本地状态仅适用于显式测试与 Preview。 */
export function RhythmStateProvider({ children }: { children: ReactNode }) {
  return usesLocalWorkspace() ? (
    <LocalRhythmTestAdapter>{children}</LocalRhythmTestAdapter>
  ) : (
    <CloudRhythmStateProvider>{children}</CloudRhythmStateProvider>
  );
}
/** 读取独立私密领域，不向工作台统计暴露生理期数据。 */
export function useRhythmState() {
  const state = useContext(Context);
  if (!state)
    throw new Error('useRhythmState must be used inside RhythmStateProvider.');
  return state;
}
