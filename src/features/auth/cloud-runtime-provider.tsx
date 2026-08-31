/**
 * @fileoverview 提供 Supabase 会话、React Query 和 Repository，并在未配置或未登录时阻断业务树。
 */

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { readSupabasePublicConfig } from '@/lib/supabase/config';
import { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';
import {
  StartupProgressProvider,
  type StartupOperation,
} from '@/features/startup/startup-progress-context';

type CloudRuntime = {
  client: SupabaseClient;
  repository: SupabaseWorkspaceRepository;
  session: Session;
  user: User;
  signOut: () => Promise<void>;
};

const CloudRuntimeContext = createContext<CloudRuntime | null>(null);

/** 读取已经通过登录门禁的云运行时。 */
export function useCloudRuntime(): CloudRuntime {
  const value = useContext(CloudRuntimeContext);
  if (!value)
    throw new Error('useCloudRuntime must be used inside CloudRuntimeProvider.');
  return value;
}

/** 测试适配器等明确无云门禁的运行时可读取 null，不触发本地业务回退。 */
export function useOptionalCloudRuntime(): CloudRuntime | null {
  return useContext(CloudRuntimeContext);
}

/** 展示明确的云配置缺失状态；Preview 不会回退本地业务数据。 */
function CloudConfigurationRequired({ reason }: { reason: string }) {
  return (
    <main className="auth-gate">
      <section className="auth-card" role="alert">
        <p className="auth-eyebrow">Threadline Cloud</p>
        <h1>尚未配置云工作区</h1>
        <p>{reason}</p>
        <p>
          Vercel Preview 必须使用 staging/test
          Supabase；没有独立项目时，此页面就是预期结果。
        </p>
      </section>
    </main>
  );
}

/** 提供 Email/password 登录表单，不在客户端保存密码或服务端 key。 */
function LoginGate({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  /** 提交 Supabase password grant；成功后的 session 由 auth state listener 接管。 */
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const response = await client.auth.signInWithPassword({ email, password });
    if (response.error) setError(response.error.message);
    setSubmitting(false);
  };

  return (
    <main className="auth-gate">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <p className="auth-eyebrow">Threadline Cloud</p>
        <h1>登录我的工作台</h1>
        <p>Web/PWA 与 Windows 使用同一账号同步任务、Daily、工作站与节律。</p>
        <label>
          邮箱
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? '正在登录…' : '登录'}
        </button>
      </form>
    </main>
  );
}

/** 协调持久 session、首次工作区初始化与登出后的 Query cache 清理。 */
function AuthenticatedRuntime({
  client,
  repository,
  queryClient,
  children,
}: {
  client: SupabaseClient;
  repository: SupabaseWorkspaceRepository;
  queryClient: QueryClient;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>();
  const [sessionRecoveryDone, setSessionRecoveryDone] = useState(false);
  const [sessionRecoveryError, setSessionRecoveryError] = useState<string>();
  const [initializationError, setInitializationError] = useState<string>();
  const [initializedOwner, setInitializedOwner] = useState<string>();

  useEffect(() => {
    let mounted = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      setSessionRecoveryError(error?.message);
      setSession(data.session);
      setSessionRecoveryDone(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSessionRecoveryError(undefined);
      setInitializationError(undefined);
      setSession(nextSession);
      if (!nextSession) queryClient.clear();
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [client, queryClient]);

  useEffect(() => {
    if (!session || initializedOwner === session.user.id) return;
    let cancelled = false;
    for (const key of [
      'threadline.tasks.v1',
      'threadline.projects.v1',
      'threadline.daily-by-date.v1',
      'threadline.daily-templates.v1',
      'threadline.daily-history.v1',
      'threadline.history.v1',
      'threadline.close-records.v1',
      'threadline.workstation.v1',
      'threadline.rhythm.v1',
      'threadline.supabase.workspace.v1',
    ])
      window.localStorage.removeItem(key);
    void repository
      .initializeWorkspace()
      .then(() => {
        if (!cancelled) setInitializedOwner(session.user.id);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setInitializationError(
            error instanceof Error ? error.message : '工作区初始化失败',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [initializedOwner, repository, session]);

  const authentication: StartupOperation = sessionRecoveryError
    ? { status: 'failed', message: sessionRecoveryError }
    : sessionRecoveryDone
      ? { status: 'completed' }
      : { status: 'active' };
  const workspaceInitialization: StartupOperation = initializationError
    ? { status: 'failed', message: initializationError }
    : session && initializedOwner === session.user.id
      ? { status: 'completed' }
      : session
        ? { status: 'active' }
        : { status: 'pending' };
  const initializedSession =
    session && initializedOwner === session.user.id ? session : undefined;
  const runtime: CloudRuntime | undefined = initializedSession
    ? {
        client,
        repository,
        session: initializedSession,
        user: initializedSession.user,
        signOut: async () => {
          const response = await client.auth.signOut();
          if (response.error) throw response.error;
        },
      }
    : undefined;

  return (
    <StartupProgressProvider
      key={session?.user.id ?? 'anonymous'}
      active={session !== null}
      authentication={authentication}
      workspaceInitialization={workspaceInitialization}
    >
      {runtime ? (
        <CloudRuntimeContext.Provider value={runtime}>
          {children}
        </CloudRuntimeContext.Provider>
      ) : session === null && sessionRecoveryDone ? (
        <LoginGate client={client} />
      ) : null}
    </StartupProgressProvider>
  );
}

/** 建立完整云运行时；配置缺失时只显示未配置页面。 */
export function CloudRuntimeProvider({ children }: { children: ReactNode }) {
  const config = useMemo(() => readSupabasePublicConfig(), []);
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnReconnect: true,
            refetchOnWindowFocus: true,
            retry: 1,
          },
          mutations: { retry: false },
        },
      }),
    [],
  );
  const resources = useMemo(() => {
    if (!config.configured) return null;
    const client = getSupabaseBrowserClient(config.value);
    return { client, repository: new SupabaseWorkspaceRepository(client) };
  }, [config]);
  if (!config.configured) return <CloudConfigurationRequired reason={config.reason} />;
  if (!resources)
    return <CloudConfigurationRequired reason="Supabase runtime 初始化失败。" />;
  return (
    <QueryClientProvider client={queryClient}>
      <AuthenticatedRuntime
        client={resources.client}
        repository={resources.repository}
        queryClient={queryClient}
      >
        {children}
      </AuthenticatedRuntime>
    </QueryClientProvider>
  );
}
