/** @fileoverview 账号隔离的习惯查询与写入确认；即时意图独立于缓存，旧响应不能覆盖新记录。 */
'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  isCancelledError,
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { useAccountTimezone } from '@/features/settings/account-timezone-provider';
import { getAccountTimezone } from '@/lib/account-clock';
import { beginCloudWrite } from '@/lib/cloud-write-guard';
import { usesLocalWorkspace } from '@/lib/workspace-runtime';
import { getMonthGrid } from '@/lib/date-range';
import { habitAddDays, habitBusinessDate } from './habit-time';
import {
  applyLocalHabitRequest,
  configureLocalHabits,
  emptyHabitData,
  mutateLocalHabits,
  readLocalHabits,
} from './habit-local-repository';
import {
  configureHabitAccount,
  listHabitData,
  saveHabitRequest,
} from './habit-repository';
import type {
  HabitData,
  HabitEntry,
  HabitRequest,
  HabitSettings,
  RuleValues,
} from './habit-types';

export interface HabitRepository {
  owner: string;
  list: (
    start: string,
    end: string,
    signal?: AbortSignal,
    knownIds?: string[],
  ) => Promise<HabitData>;
  apply: (request: HabitRequest) => Promise<HabitEntry[]>;
  configure: (
    timezone: string,
    initialTimezone: string,
    rules: RuleValues,
    version: number,
    requestId: string,
  ) => Promise<HabitSettings>;
  subscribe: (refresh: () => void) => () => void;
}
type HabitsContext = {
  data: HabitData;
  now: string;
  loading: boolean;
  ready: boolean;
  error?: string;
  notice?: string;
  pending: HabitRequest | null;
  busy: boolean;
  save: (request: HabitRequest) => Promise<void>;
  configure: (
    timezone: string,
    rules: RuleValues,
    version: number,
    requestId: string,
  ) => Promise<void>;
  retry: () => void;
  discard: () => void;
  setRange: (start: string, end: string) => void;
};
const Context = createContext<HabitsContext | null>(null);

/** 单调合并每条记录，包括墓碑；日期移动后旧范围中的同一身份也必须移除。 */
export function mergeHabitEntries(
  rows: HabitEntry[],
  confirmed: Map<string, HabitEntry>,
): HabitEntry[] {
  const result = new Map(rows.map((row) => [row.id, row]));
  for (const row of confirmed.values())
    if ((result.get(row.id)?.version ?? 0) <= row.version) result.set(row.id, row);
  return [...result.values()];
}
/** 共用状态机：保存结果先确认，刷新失败与写入失败分开；失败请求由 UI 原样重试。 */
export function HabitStore({
  repository,
  children,
}: {
  repository: HabitRepository;
  children: ReactNode;
}) {
  const account = useAccountTimezone();
  const [confirmedSettings, setConfirmedSettings] = useState<HabitSettings | null>(
    null,
  );
  const queryClient = useQueryClient();
  const timezone = account?.settings?.timezone ?? getAccountTimezone();
  const [now, setNow] = useState(() => new Date().toISOString());
  const today = habitBusinessDate(now, timezone, 'wake');
  // 覆盖默认月历及完整比较周期，避免第一次打开页面后再串行补读范围。
  const [range, updateRange] = useState<{ start: string; end: string }>(() => ({
    start: [habitAddDays(today, -35), getMonthGrid(today)[0]].sort()[0],
    end: getMonthGrid(today).at(-1)!,
  }));
  const [pending, setPending] = useState<HabitRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  // 重新挂载也继承当前账号缓存中的最高版本，避免后台旧读取撤销已确认记录。
  const [initialConfirmed] = useState(() => {
    const entries = new Map<string, HabitEntry>();
    for (const [, cached] of queryClient.getQueriesData<HabitData>({
      queryKey: ['habits', repository.owner],
    }))
      for (const row of cached?.entries ?? [])
        if ((entries.get(row.id)?.version ?? 0) < row.version) entries.set(row.id, row);
    return entries;
  });
  const confirmed = useRef(initialConfirmed);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const key = ['habits', repository.owner, range.start, range.end];
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const result = await repository.list(range.start, range.end, signal, [
        ...confirmed.current.keys(),
      ]);
      if (!signal.aborted && mounted.current)
        for (const row of result.entries) {
          if ((confirmed.current.get(row.id)?.version ?? 0) < row.version)
            confirmed.current.set(row.id, row);
        }
      return {
        ...result,
        entries: mergeHabitEntries(result.entries, confirmed.current),
      };
    },
    networkMode: 'always',
    // 账号时区就绪后后台预读；导航不再启停查询，也不增加全局启动等待。
    enabled: !account || Boolean(account.settings),
    staleTime: 60_000,
  });
  const fallback = useMemo(() => emptyHabitData(timezone), [timezone]);
  const queried = query.data ?? fallback;
  const settings = [queried.settings, account?.settings, confirmedSettings]
    .filter((value): value is HabitSettings => Boolean(value))
    .sort((a, b) => b.version - a.version)[0];
  const data = { ...queried, settings };
  useEffect(() => {
    if (query.data) account?.accept(query.data.settings);
    // 只在查询的设置版本变化时接收，避免上下文广播形成循环。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.settings.version, query.data?.settings.timezone]);
  const setRange = useCallback((start: string, end: string) => {
    updateRange((old) =>
      old.start <= start && old.end >= end
        ? old
        : {
            start: old.start < start ? old.start : start,
            end: old.end > end ? old.end : end,
          },
    );
  }, []);
  useEffect(() => {
    /** 恢复前台和每分钟更新时间，跨午夜不沿用初次挂载的日期。 */
    const tick = () => setNow(new Date().toISOString());
    const timer = setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  useEffect(
    () =>
      repository.subscribe(() => {
        void queryClient.invalidateQueries({ queryKey: ['habits', repository.owner] });
      }),
    [repository, queryClient],
  );
  /** 写入返回后合并当前版本，后台 refetch 失败只提示不同步，绝不撤销保存。 */
  const refresh = async () => {
    try {
      await queryClient.invalidateQueries(
        { queryKey: ['habits', repository.owner] },
        { throwOnError: true },
      );
      setNotice(undefined);
    } catch (reason) {
      if (isCancelledError(reason)) return;
      setNotice(
        `记录已保存。统计刷新失败：${reason instanceof Error ? reason.message : '请重新读取'}`,
      );
    }
  };
  /** 保存前同步加锁，双击不生成并发写；失败保留冻结时间和稳定请求 ID。 */
  const save = async (request: HabitRequest) => {
    if (locked.current) throw new Error('正在保存，请稍后');
    if (
      pending &&
      pending.requestId !== request.requestId &&
      pending.changes.some(
        (old) => !request.changes.some((next) => old.kind === next.kind),
      )
    )
      throw new Error('请先重试或丢弃上一份待保存输入');
    locked.current = true;
    setBusy(true);
    setPending(request);
    setError(undefined);
    setNotice(undefined);
    let endWrite: (() => void) | undefined;
    try {
      if (!navigator.onLine)
        throw new Error('当前离线，时间和输入已保留，请联网后重试');
      endWrite = beginCloudWrite();
      const saved = await repository.apply(request);
      if (!mounted.current) return;
      await queryClient.cancelQueries({ queryKey: ['habits', repository.owner] });
      for (const row of saved)
        if ((confirmed.current.get(row.id)?.version ?? 0) <= row.version)
          confirmed.current.set(row.id, row);
      queryClient.setQueriesData<HabitData>(
        { queryKey: ['habits', repository.owner] },
        (current) =>
          current
            ? {
                ...current,
                entries: mergeHabitEntries(current.entries, confirmed.current),
              }
            : current,
      );
      setPending(null);
      void refresh();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '保存失败，请重试';
      setError(message);
      throw reason;
    } finally {
      endWrite?.();
      locked.current = false;
      setBusy(false);
    }
  };
  /** 设置失败交由设置表单保留草稿；配置成功后重新读取账号规则。 */
  const configure = async (
    zone: string,
    rules: RuleValues,
    version: number,
    requestId: string,
  ) => {
    if (locked.current) throw new Error('正在保存，请稍后');
    locked.current = true;
    setBusy(true);
    let endWrite: (() => void) | undefined;
    try {
      if (!navigator.onLine) throw new Error('当前离线，输入已保留，请联网后重试');
      endWrite = beginCloudWrite();
      const savedSettings = await repository.configure(
        zone,
        data.settings.timezone,
        rules,
        version,
        requestId,
      );
      if (!mounted.current) return;
      await queryClient.cancelQueries({ queryKey: ['habits', repository.owner] });
      setConfirmedSettings(savedSettings);
      account?.accept(savedSettings);
      queryClient.setQueriesData<HabitData>(
        { queryKey: ['habits', repository.owner] },
        (current) => (current ? { ...current, settings: savedSettings } : current),
      );
      void refresh();
    } finally {
      endWrite?.();
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <Context.Provider
      value={{
        data,
        now,
        loading: query.isPending,
        ready: Boolean(query.data),
        error: error ?? query.error?.message,
        notice,
        pending,
        busy,
        save,
        configure,
        retry: () => {
          if (!pending) setError(undefined);
          setNotice(undefined);
          void query.refetch();
        },
        discard: () => {
          if (locked.current) return;
          setPending(null);
          setError(undefined);
          void query.refetch();
        },
        setRange,
      }}
    >
      {children}
    </Context.Provider>
  );
}
/** 正式账号复用现有 QueryClient 与受跟踪的 Supabase transport。 */
function CloudHabits({ children }: { children: ReactNode }) {
  const { client, user } = useCloudRuntime();
  const repository = useMemo<HabitRepository>(
    () => ({
      owner: user.id,
      list: (start, end, signal, knownIds) =>
        listHabitData(
          client,
          user.id,
          getAccountTimezone(),
          start,
          end,
          signal,
          knownIds,
        ),
      apply: (request) => saveHabitRequest(client, request),
      configure: (zone, initial, rules, version, requestId) =>
        configureHabitAccount(client, zone, initial, rules, version, requestId),
      subscribe: (refresh) => {
        const channel = client.channel(`habits:${user.id}`);
        for (const table of ['habit_settings', 'habit_rule_versions', 'habit_entries'])
          channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table, filter: `owner_id=eq.${user.id}` },
            refresh,
          );
        channel.subscribe();
        return () => {
          void client.removeChannel(channel);
        };
      },
    }),
    [client, user.id],
  );
  return (
    <HabitStore key={user.id} repository={repository}>
      {children}
    </HabitStore>
  );
}
/** Preview 不依赖云 Provider；独立缓存且同标签页/多标签页都能刷新。 */
function LocalHabits({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const repository = useMemo<HabitRepository>(() => {
    const timezone = getAccountTimezone();
    return {
      owner: 'local',
      list: async () => readLocalHabits(timezone),
      apply: async (request) =>
        (
          await mutateLocalHabits(timezone, (data) =>
            applyLocalHabitRequest(data, request, new Date().toISOString()),
          )
        ).entries,
      configure: async (zone, _initial, rules, version, requestId) => {
        const next = await mutateLocalHabits(timezone, (data) =>
          configureLocalHabits(
            data,
            zone,
            rules,
            version,
            requestId,
            new Date().toISOString(),
          ),
        );
        return next.settings;
      },
      subscribe: (refresh) => {
        window.addEventListener('storage', refresh);
        window.addEventListener('habits-changed', refresh);
        return () => {
          window.removeEventListener('storage', refresh);
          window.removeEventListener('habits-changed', refresh);
        };
      },
    };
  }, []);
  return (
    <QueryClientProvider client={client}>
      <HabitStore repository={repository}>{children}</HabitStore>
    </QueryClientProvider>
  );
}
/** 数据来源只由既有运行模式决定，生产失败不会回退到本地。 */
export function HabitsStateProvider({ children }: { children: ReactNode }) {
  return usesLocalWorkspace() ? (
    <LocalHabits>{children}</LocalHabits>
  ) : (
    <CloudHabits>{children}</CloudHabits>
  );
}
/** 读取习惯领域，不把记录暴露给任务统计。 */
export function useHabits() {
  const value = useContext(Context);
  if (!value) throw new Error('习惯页面需要 HabitsStateProvider');
  return value;
}
