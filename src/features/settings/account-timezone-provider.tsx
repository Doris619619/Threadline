/** @fileoverview 账号时区在业务树之前读取，与旧版 habit_settings 共用唯一真源，跨设备及窗口实时同步。 */
'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useOptionalStartupProgress } from '@/features/startup/startup-progress-context';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { beginCloudWrite } from '@/lib/cloud-write-guard';
import {
  getAccountTimezone,
  notifyAccountClock,
  setAccountTimezone,
  subscribeAccountClock,
} from '@/lib/account-clock';
import { getLocalDateKey } from '@/lib/local-date';
import {
  mutateLocalHabits,
  readLocalHabits,
} from '@/features/habits/habit-local-repository';
import { checkHabitError, readHabitSettings } from '@/features/habits/habit-repository';
import type { HabitSettings } from '@/features/habits/habit-types';

type AccountZone = {
  settings: HabitSettings | null;
  accept: (settings: HabitSettings) => void;
  saveTimezone: (timezone: string, version: number, requestId: string) => Promise<void>;
};
const Context = createContext<AccountZone | null>(null);

/** 订阅账号自然日；时区切换、午夜和从休眠恢复都通知日期消费者。 */
export function useAccountToday() {
  return useSyncExternalStore(subscribeAccountClock, getLocalDateKey, getLocalDateKey);
}

/** 使用上下文订阅设置版本，同时让独立组件测试可以不安装整个业务树。 */
export function useAccountTimezone() {
  return useContext(Context);
}

/** 一个已登录账号对应一个时钟会话；旧账号异步响应不得重新写入时区。 */
function AccountTimezoneSession({ children }: { children: ReactNode }) {
  const cloud = useOptionalCloudRuntime();
  const owner = cloud?.user.id ?? 'local';
  const startup = useOptionalStartupProgress();
  const setTimezoneStatus = startup?.setAccountTimezoneStatus;
  const [settings, setSettings] = useState<HabitSettings | null>(null);
  const latest = useRef<HabitSettings | null>(null);
  const alive = useRef(true);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setError(undefined);
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    setTimezoneStatus?.({
      status: settings ? 'completed' : error ? 'failed' : 'active',
      message: error,
      retry,
    });
  }, [settings, error, retry, setTimezoneStatus]);
  const initialZone = useRef(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  /** 仅接收当前账号的单调版本；取消或迟到的读取不能撤销已保存选择。 */
  const accept = (next: HabitSettings) => {
    if (
      !alive.current ||
      next.owner_id !== owner ||
      (latest.current?.version ?? -1) > next.version
    )
      return;
    latest.current = next;
    setAccountTimezone(next.timezone);
    setSettings(next);
    setError(undefined);
  };
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    /** 首次默认仅创建缺失设置，已有账号在其他设备上的选择不会被覆盖。 */
    const load = async () => {
      try {
        let next: HabitSettings;
        if (cloud) {
          const result = await cloud.client
            .from('habit_settings')
            .select('*')
            .eq('owner_id', owner)
            .maybeSingle();
          checkHabitError(result.error);
          if (cancelled) return;
          if (result.data) next = result.data as HabitSettings;
          else {
            const endWrite = beginCloudWrite();
            try {
              const initialized = await cloud.client.rpc('set_account_timezone', {
                p_timezone: initialZone.current,
                p_expected_version: null,
                p_request_id: crypto.randomUUID(),
              });
              checkHabitError(initialized.error);
              next = readHabitSettings(initialized.data);
            } finally {
              endWrite();
            }
          }
        } else next = readLocalHabits(initialZone.current).settings;
        if (!cancelled) accept(next);
      } catch (reason) {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : '时区读取失败');
      }
    };
    void load();
    const reload = () => {
      void load();
    };
    const channel = cloud?.client
      .channel(`account-timezone:${owner}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'habit_settings',
          filter: `owner_id=eq.${owner}`,
        },
        reload,
      )
      .subscribe();
    window.addEventListener('storage', reload);
    window.addEventListener('habits-changed', reload);
    window.addEventListener('focus', reload);
    const timer = setInterval(notifyAccountClock, 1000);
    return () => {
      cancelled = true;
      alive.current = false;
      if (channel) void cloud!.client.removeChannel(channel);
      window.removeEventListener('storage', reload);
      window.removeEventListener('habits-changed', reload);
      window.removeEventListener('focus', reload);
      clearInterval(timer);
      setAccountTimezone(undefined);
    };
    // accept 只读取 ref；订阅生命周期由账号和重试控制。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud?.client, owner, attempt]);

  /** 时区单独保存不生成新的睡觉规则；超时重试沿用请求 ID 和预期版本。 */
  const saveTimezone = async (zone: string, version: number, requestId: string) => {
    if (!navigator.onLine) throw new Error('当前离线，请联网后重试');
    const endWrite = beginCloudWrite();
    try {
      if (cloud) {
        const result = await cloud.client.rpc('set_account_timezone', {
          p_timezone: zone,
          p_expected_version: version,
          p_request_id: requestId,
        });
        checkHabitError(result.error);
        accept(readHabitSettings(result.data));
      } else {
        const next = await mutateLocalHabits(getAccountTimezone(), (data) => {
          if (data.configurationRequests.includes(requestId)) return data;
          if (data.settings.version !== version)
            throw new Error('设置已改变，请重新打开后保存');
          new Intl.DateTimeFormat('en', { timeZone: zone }).format();
          return {
            ...data,
            settings: {
              ...data.settings,
              timezone: zone,
              version: version + 1,
              updated_at: new Date().toISOString(),
            },
            configurationRequests: [...data.configurationRequests, requestId],
          };
        });
        accept(next.settings);
      }
    } finally {
      endWrite();
    }
  };
  if (!settings)
    return (
      <div className="auth-gate" role={error ? 'alert' : 'status'}>
        <p>{error ?? '正在读取账号时区…'}</p>
        {error && (
          <button type="button" onClick={retry}>
            重新读取
          </button>
        )}
      </div>
    );
  return (
    <Context.Provider value={{ settings, accept, saveTimezone }}>
      {children}
    </Context.Provider>
  );
}

/** 注销或换号立即销毁上一账号状态。 */
export function AccountTimezoneProvider({ children }: { children: ReactNode }) {
  const cloud = useOptionalCloudRuntime();
  return (
    <AccountTimezoneSession key={cloud?.user.id ?? 'local'}>
      {children}
    </AccountTimezoneSession>
  );
}
