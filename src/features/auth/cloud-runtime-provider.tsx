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
  type MouseEvent,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, X } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { readSupabasePublicConfig } from '@/lib/supabase/config';
import { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';
import {
  StartupProgressProvider,
  type StartupOperation,
} from '@/features/startup/startup-progress-context';
import { getMainDesktopBridge } from '@/lib/desktop-bridge';

type CloudRuntime = {
  client: SupabaseClient;
  repository: SupabaseWorkspaceRepository;
  session: Session;
  user: User;
  signOut: () => Promise<void>;
};

const CloudRuntimeContext = createContext<CloudRuntime | null>(null);

/** 在 Electron 主窗口把 mailto 交给受限 bridge；Web/PWA 保留浏览器原生链接行为。 */
function openDesktopMailto(event: MouseEvent<HTMLAnchorElement>): void {
  const bridge = getMainDesktopBridge();
  if (!bridge) return;
  event.preventDefault();
  void bridge.openMailto(event.currentTarget.href).catch(() => undefined);
}

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

/** 普通云运行时缺配置时阻断业务树；自动 Preview 演示不挂载此门禁。 */
function CloudConfigurationRequired({ reason }: { reason: string }) {
  return (
    <main className="auth-gate">
      <section className="auth-card" role="alert">
        <p className="auth-eyebrow">Threadline Cloud</p>
        <h1>尚未配置云工作区</h1>
        <p>{reason}</p>
        <p>
          当前云工作区缺少连接配置，请完成配置后重新部署。在线演示请使用 PR 的预览链接。
        </p>
      </section>
    </main>
  );
}

/** 提供 Email/password 登录门禁，支持 P1（欢迎页）与 P2（登录输入页）双向交互。 */
function LoginGate({ client }: { client: SupabaseClient }) {
  const [view, setView] = useState<'welcome' | 'form'>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      <div className="auth-viewport">
        {view === 'welcome' ? (
          <section className="auth-view auth-view-welcome" aria-label="欢迎页面">
            <header className="auth-nav-bar">
              <button
                type="button"
                className="auth-icon-btn"
                aria-label="关闭"
                onClick={() => setView('form')}
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </header>

            <div className="auth-illustration-wrap">
              <Image
                src="/auth/welcome-illustration.jpg"
                alt="欢迎来到 Threadline"
                fill
                priority
                className="auth-illustration-img"
                sizes="(max-width: 440px) 100vw, 440px"
              />
            </div>

            <div className="auth-content-block">
              <h1 className="auth-headline">欢迎回到 Threadline</h1>
              <p className="auth-subline">使用指定账号继续，快速进入你的工作台。</p>
            </div>

            <div className="auth-action-block">
              <div className="auth-pill-divider" aria-hidden="true" />
              <button
                type="button"
                className="auth-primary-btn"
                onClick={() => setView('form')}
              >
                使用指定账号继续
              </button>
            </div>

            <footer className="auth-footer-card">
              <p className="auth-footer-title">没有账号？</p>
              <p className="auth-footer-prompt">请联系开发者</p>
              <a
                href="mailto:124090348@link.cuhk.edu.cn"
                className="auth-footer-link"
                onClick={openDesktopMailto}
              >
                124090348@link.cuhk.edu.cn
              </a>
            </footer>
          </section>
        ) : (
          <section className="auth-view auth-view-form" aria-label="登录页面">
            <header className="auth-nav-bar">
              <button
                type="button"
                className="auth-icon-btn"
                aria-label="返回"
                onClick={() => setView('welcome')}
              >
                <ArrowLeft size={18} strokeWidth={2.2} />
              </button>
              <span className="auth-nav-title">登录</span>
            </header>

            <div className="auth-bg-illustration-wrap" aria-hidden="true">
              <Image
                src="/auth/login-illustration.jpg"
                alt=""
                fill
                priority
                className="auth-bg-illustration-img"
                sizes="(max-width: 440px) 100vw, 440px"
              />
            </div>

            <div className="auth-brand-badge">
              <Image
                src="/icon.png"
                alt="Threadline"
                width={40}
                height={40}
                className="auth-brand-logo"
                unoptimized
              />
              <span className="auth-brand-name">Threadline</span>
            </div>

            <div className="auth-form-header">
              <h1 className="auth-headline">登录我的工作台</h1>
              <p className="auth-subline">请输入账号信息以继续。</p>
            </div>

            <form className="auth-form-card" onSubmit={(event) => void submit(event)}>
              <label className="auth-field-label" htmlFor="auth-email">
                邮箱
              </label>
              <div className="auth-input-group">
                <span className="auth-input-icon" aria-hidden="true">
                  <Mail size={18} strokeWidth={1.8} />
                </span>
                <input
                  id="auth-email"
                  type="email"
                  className="auth-text-input"
                  placeholder="邮箱"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <label className="auth-field-label" htmlFor="auth-password">
                密码
              </label>
              <div className="auth-input-group">
                <span className="auth-input-icon" aria-hidden="true">
                  <Lock size={18} strokeWidth={1.8} />
                </span>
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-text-input"
                  placeholder="密码"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="auth-input-action-btn"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff size={18} strokeWidth={1.8} />
                  ) : (
                    <Eye size={18} strokeWidth={1.8} />
                  )}
                </button>
              </div>

              <div className="auth-form-auxiliary">
                <a
                  href="mailto:124090348@link.cuhk.edu.cn?subject=%E5%BF%98%E8%AE%B0%E5%AF%86%E7%A0%81%E7%94%B3%E8%AF%B7"
                  className="auth-auxiliary-link"
                  onClick={openDesktopMailto}
                >
                  忘记密码？
                </a>
              </div>

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="auth-primary-btn"
                disabled={submitting}
              >
                {submitting ? '正在登录…' : '登录'}
              </button>
            </form>

            <footer className="auth-form-footer">
              <div className="auth-footer-divider">
                <span className="auth-divider-line" />
                <span className="auth-divider-text">没有账号？</span>
                <span className="auth-divider-line" />
              </div>
              <p className="auth-footer-prompt">请联系开发者</p>
              <a
                href="mailto:124090348@link.cuhk.edu.cn"
                className="auth-footer-link"
                onClick={openDesktopMailto}
              >
                124090348@link.cuhk.edu.cn
              </a>
            </footer>
          </section>
        )}
      </div>
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
