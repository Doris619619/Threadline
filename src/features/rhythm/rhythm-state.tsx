/** @fileoverview 通过 Supabase 同步节律标记，同时保持它与 workspace analytics 相互独立。 */

'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { usePersistentState } from '@/hooks/use-persistent-state';

type RhythmState = { marks: Record<string, boolean> };
type RhythmActions = { toggleMark: (date: string) => void };
const RhythmStateContext = createContext<RhythmState | null>(null);
const RhythmActionsContext = createContext<RhythmActions | null>(null);

/** 提供 owner-scoped 云端节律标记；Realtime 只失效 query，不产生写回。 */
function CloudRhythmStateProvider({ children }: { children: ReactNode }) {
  const { client, repository, user } = useCloudRuntime();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['rhythm', user.id],
    queryFn: () => repository.listRhythmMarks(),
  });
  const mutation = useMutation({
    mutationFn: ({ date, marked }: { date: string; marked: boolean }) =>
      repository.saveRhythmMark(date, marked),
    onSuccess: (row) =>
      queryClient.setQueryData<Record<string, boolean>>(
        ['rhythm', user.id],
        (current = {}) => ({ ...current, [row.date]: row.marked }),
      ),
  });
  const marks = useMemo(() => query.data ?? {}, [query.data]);
  const { isPending, mutate } = mutation;

  useEffect(() => {
    const channel = client
      .channel(`rhythm:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rhythm_marks',
          filter: `owner_id=eq.${user.id}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: ['rhythm', user.id] }),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rhythm_marks',
          filter: `owner_id=eq.${user.id}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: ['rhythm', user.id] }),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [client, queryClient, user.id]);

  const state = useMemo(() => ({ marks }), [marks]);
  const actions = useMemo(
    () => ({
      toggleMark: (date: string) => {
        if (!navigator.onLine || isPending) return;
        mutate({ date, marked: !marks[date] });
      },
    }),
    [isPending, marks, mutate],
  );
  return (
    <RhythmActionsContext.Provider value={actions}>
      <RhythmStateContext.Provider value={state}>
        {children}
      </RhythmStateContext.Provider>
    </RhythmActionsContext.Provider>
  );
}

/** 仅供显式端到端测试构建使用的本地 Rhythm adapter。 */
function LocalRhythmTestAdapter({ children }: { children: ReactNode }) {
  const [marks, setMarks] = usePersistentState<Record<string, boolean>>(
    'threadline.test.rhythm.v1',
    {},
  );
  const state = useMemo(() => ({ marks }), [marks]);
  const actions = useMemo(
    () => ({
      toggleMark: (date: string) =>
        setMarks((current) => ({ ...current, [date]: !current[date] })),
    }),
    [setMarks],
  );
  return (
    <RhythmActionsContext.Provider value={actions}>
      <RhythmStateContext.Provider value={state}>
        {children}
      </RhythmStateContext.Provider>
    </RhythmActionsContext.Provider>
  );
}

/** 显式测试构建才使用本地 adapter，生产缺配置时由 Auth gate 阻断。 */
export function RhythmStateProvider({ children }: { children: ReactNode }) {
  return process.env.NEXT_PUBLIC_THREADLINE_TEST_ADAPTER === 'true' ? (
    <LocalRhythmTestAdapter>{children}</LocalRhythmTestAdapter>
  ) : (
    <CloudRhythmStateProvider>{children}</CloudRhythmStateProvider>
  );
}

/** 读取节律领域状态与唯一的日期标记动作。 */
export function useRhythmState() {
  const state = useContext(RhythmStateContext);
  const actions = useContext(RhythmActionsContext);
  if (!state || !actions)
    throw new Error('useRhythmState must be used inside RhythmStateProvider.');
  return { ...state, ...actions };
}
