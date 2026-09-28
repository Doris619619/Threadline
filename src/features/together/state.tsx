/** @fileoverview 两人空间独立账号缓存、轻量实时订阅和写操作，不改变个人任务的 QueryClient。 */
'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { beginCloudWrite } from '@/lib/cloud-write-guard';
import { checkSpaceError, executeCommand, readRooms } from './repository';
import type { Command, CommandResult, Room } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
type Store = {
  client: SupabaseClient | null;
  cache: QueryClient;
  user: string;
  rooms: Room[];
  room?: Room;
  pending: number;
  loading: boolean;
  error?: string;
  syncError?: string;
  refresh: () => Promise<void>;
  run: (command: Command) => Promise<CommandResult>;
};
const Context = createContext<Store | null>(null);
/** 登录账号切换即销毁前一会话的数据与请求。 */
export function TogetherProvider({ children }: { children: ReactNode }) {
  const cloud = useOptionalCloudRuntime();
  return (
    <TogetherSession
      key={cloud?.user.id ?? 'offline'}
      client={cloud?.client ?? null}
      user={cloud?.user.id ?? ''}
    >
      {children}
    </TogetherSession>
  );
}
/** 按当前成员权限订阅空间；查询失败不阻塞现有工作台。 */
export function TogetherSession({
  client,
  user,
  children,
  realtime = true,
}: {
  client: SupabaseClient | null;
  user: string;
  children: ReactNode;
  realtime?: boolean;
}) {
  const [cache] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 15000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
        },
      }),
  );
  const [syncError, setSyncError] = useState<string>();
  const alive = useRef(true);
  const query = useQuery(
    {
      queryKey: ['together', user, 'rooms'],
      enabled: !!client,
      queryFn: ({ signal }) => readRooms(client!, signal),
    },
    cache,
  );
  const rooms = query.data ?? [];
  const room = rooms.find((item) => !item.ended_at);
  const count = useQuery(
    {
      queryKey: ['together', user, 'pending', room?.id],
      enabled: !!client && !!room,
      queryFn: async ({ signal }) => {
        const response = await client!
          .from('together_flags')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', room!.id)
          .eq('status', 'submitted')
          .neq('owner_id', user)
          .abortSignal(signal);
        checkSpaceError(response.error);
        return response.count ?? 0;
      },
    },
    cache,
  );
  /** 刷新本领域查询，不重新读取整个个人工作台。 */
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ['together', user] });
  };
  useEffect(() => {
    alive.current = true;
    cache.mount();
    /** 回到窗口或恢复网络后强制核对服务端，不依赖失效的 Realtime。 */
    const reload = () => {
      void cache.invalidateQueries({ queryKey: ['together', user] });
    };
    window.addEventListener('focus', reload);
    window.addEventListener('online', reload);
    const channel = realtime ? client?.channel(`together:${user}`) : undefined;
    channel?.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'together_rooms' },
      reload,
    );
    channel?.subscribe((status) => {
      if (!alive.current) return;
      if (status === 'SUBSCRIBED') {
        setSyncError(undefined);
        reload();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
        setSyncError('实时连接暂不可用，回到页面会重新读取。');
    });
    return () => {
      alive.current = false;
      if (channel) void client!.removeChannel(channel);
      window.removeEventListener('focus', reload);
      window.removeEventListener('online', reload);
      void cache.cancelQueries();
      cache.clear();
      cache.unmount();
    };
  }, [client, user, cache, realtime]);
  /** 稳定请求由表单持有；账号退出后不刷新或更新前一会话。 */
  const run = async (command: Command) => {
    if (!client) throw new Error('请使用已有账号登录后开启两人空间。');
    if (!navigator.onLine) throw new Error('当前离线，输入已保留，请联网后重试。');
    const end = beginCloudWrite();
    try {
      const result = await executeCommand(client, user, command);
      if (alive.current) await refresh();
      return result;
    } finally {
      end();
    }
  };
  return (
    <Context.Provider
      value={{
        client,
        cache,
        user,
        rooms,
        room,
        pending: count.data ?? 0,
        loading: !!client && query.isPending,
        error: query.error?.message ?? count.error?.message,
        syncError,
        refresh,
        run,
      }}
    >
      {children}
    </Context.Provider>
  );
}
/** 导航独立测试可不安装两人 Provider。 */
export function useOptionalTogether() {
  return useContext(Context);
}
/** 读取两人领域，不暴露到个人任务统计。 */
export function useTogether() {
  const value = useContext(Context);
  if (!value) throw new Error('缺少两人空间运行时');
  return value;
}
