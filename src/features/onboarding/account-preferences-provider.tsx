/** @fileoverview 读取并同步账号偏好，按账号隔离异步结果；仅 Preview 使用本地适配器。 */
'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { beginCloudWrite } from '@/lib/cloud-write-guard';
import {
  canShowRhythm,
  readAccountPreferences,
  type AccountPreferences,
  type Gender,
} from './account-preferences';

export const previewPreferencesKey = 'threadline.profile.preview.v1';
type PreferencesContext = {
  profile: AccountPreferences | null;
  error?: string;
  reload: () => Promise<void>;
  save: (gender: Gender | null, complete?: boolean) => Promise<void>;
};
const Context = createContext<PreferencesContext | null>(null);

/** 设置、引导共用已确认状态；孤立组件测试可不挂载账号 Provider。 */
export function useAccountPreferences() {
  return useContext(Context);
}
/** 孤立 Preview 组件保持既有显示；生产 Provider 加载期间不可显示节律。 */
export function useRhythmVisible() {
  const preferences = useAccountPreferences();
  return preferences ? canShowRhythm(preferences.profile) : true;
}

/** 单账号会话拒绝旧版本和已卸载会话的响应。 */
function PreferencesSession({ children }: { children: ReactNode }) {
  const cloud = useOptionalCloudRuntime();
  const client = cloud?.client;
  const owner = cloud?.user.id ?? 'preview';
  const [profile, setProfile] = useState<AccountPreferences | null>(null);
  const [error, setError] = useState<string>();
  const latest = useRef<AccountPreferences | null>(null);
  const alive = useRef(false);
  /** 只接收当前会话的单调版本，避免焦点刷新覆盖刚保存的数据。 */
  const accept = useCallback(
    (value: unknown) => {
      const next = readAccountPreferences(value, owner);
      if (
        !alive.current ||
        next.preferences_version < (latest.current?.preferences_version ?? -1)
      )
        return;
      latest.current = next;
      setProfile(next);
      setError(undefined);
    },
    [owner],
  );
  /** 云读取失败保留错误；Preview 默认完整资料，不改变既有演示入口。 */
  const reload = useCallback(async () => {
    try {
      if (client) {
        const result = await client
          .from('workspace_profiles')
          .select('owner_id,gender,onboarding_completed_at,preferences_version')
          .eq('owner_id', owner)
          .single();
        if (result.error) throw new Error(result.error.message);
        accept(result.data);
      } else {
        const raw = localStorage.getItem(previewPreferencesKey);
        accept(
          raw
            ? JSON.parse(raw)
            : {
                owner_id: owner,
                gender: 'female',
                onboarding_completed_at: '2026-01-01T00:00:00Z',
                preferences_version: 0,
              },
        );
      }
    } catch (cause) {
      if (alive.current)
        setError(cause instanceof Error ? cause.message : '账号偏好读取失败，请重试。');
    }
  }, [accept, client, owner]);
  useEffect(() => {
    alive.current = true;
    void reload();
    const refresh = () => {
      void reload();
    };
    const channel = client
      ?.channel(`account-preferences:${owner}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workspace_profiles',
          filter: `owner_id=eq.${owner}`,
        },
        refresh,
      )
      .subscribe();
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      alive.current = false;
      if (channel) void client!.removeChannel(channel);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [client, owner, reload]);
  /** 仅在服务端确认后更新；保存冲突先刷新，用户可保留选择后重试。 */
  const save = async (gender: Gender | null, complete = false) => {
    const previous = latest.current;
    if (!previous || !alive.current) throw new Error('账号偏好尚未就绪。');
    const endWrite = beginCloudWrite();
    try {
      if (client) {
        if (!navigator.onLine) throw new Error('当前离线，请联网后重试。');
        const result = await client.rpc('save_account_preferences', {
          p_gender: gender,
          p_complete: complete,
          p_expected_version: previous.preferences_version,
        });
        if (result.error) {
          if (result.error.message.includes('PREFERENCES_CONFLICT')) {
            await reload();
            throw new Error('偏好已在其他设备修改，请确认后重试。');
          }
          throw new Error(result.error.message);
        }
        accept(result.data);
      } else {
        const next = readAccountPreferences(
          {
            ...previous,
            gender: gender ?? previous.gender,
            onboarding_completed_at: complete
              ? (previous.onboarding_completed_at ?? new Date().toISOString())
              : previous.onboarding_completed_at,
            preferences_version: previous.preferences_version + 1,
          },
          owner,
        );
        localStorage.setItem(previewPreferencesKey, JSON.stringify(next));
        accept(next);
      }
    } finally {
      endWrite();
    }
  };
  return (
    <Context.Provider value={{ profile, error, reload, save }}>
      {children}
    </Context.Provider>
  );
}

/** 账号切换直接销毁旧会话，包括正在等待的读取和写入。 */
export function AccountPreferencesProvider({ children }: { children: ReactNode }) {
  const cloud = useOptionalCloudRuntime();
  return (
    <PreferencesSession key={cloud?.user.id ?? 'preview'}>
      {children}
    </PreferencesSession>
  );
}
