/** @fileoverview 用受控账号和本机偏好读取验证登录启动页连续性，以及真实引导和失败恢复出口。 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountPreferencesProvider } from '@/features/onboarding/account-preferences-provider';
import type { AccountPreferences } from '@/features/onboarding/account-preferences';
import { OnboardingGate } from '@/features/onboarding/onboarding-gate';
import {
  StartupProgressProvider,
  useOptionalStartupProgress,
} from '@/features/startup/startup-progress-context';
import type { AutoStartState } from '@/lib/desktop-auto-start';
import type { ThreadlineDesktopBridge } from '@/lib/desktop-bridge';

const fixture = vi.hoisted(() => ({ read: vi.fn(), signOut: vi.fn() }));
vi.mock('@/features/auth/cloud-runtime-provider', () => ({
  useOptionalCloudRuntime: () => runtime,
}));
vi.mock('@/components/desktop-entry-chrome', () => ({
  DesktopEntryChrome: () => null,
}));

const client = {
  from: () => ({ select: () => ({ eq: () => ({ single: fixture.read }) }) }),
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  },
  removeChannel: vi.fn(),
};
const runtime = { user: { id: 'A' }, client, signOut: fixture.signOut };
const completedProfile: AccountPreferences = {
  owner_id: 'A',
  gender: 'female',
  onboarding_completed_at: '2026-09-20T00:00:00Z',
  preferences_version: 1,
};
const decidedAutoStart: AutoStartState = {
  supported: true,
  enabled: true,
  decided: true,
};

/** 由测试显式完成或拒绝异步读取，确保初始等待不会被自动 act 掩盖。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** 仅模拟安装版读取接口，测试不得调用真实系统启动项。 */
function installAutoStartReader(read: () => Promise<AutoStartState>) {
  window.threadlineDesktop = {
    environment: 'electron',
    role: 'main',
    getAutoStartState: read,
  } as unknown as ThreadlineDesktopBridge;
}

/** 模拟门禁通过后时区和业务查询按自身状态汇报，完成偏好不等于完成业务加载。 */
function Workspace({ ready }: { ready: boolean }) {
  const progress = useOptionalStartupProgress();
  const setTimezone = progress?.setAccountTimezoneStatus;
  const setData = progress?.setWorkspaceDataStatus;
  useEffect(() => {
    setTimezone?.({ status: 'completed' });
    setData?.({ status: ready ? 'completed' : 'active' });
  }, [ready, setData, setTimezone]);
  return <p>工作台内容</p>;
}

/** 使用真实账号 Provider 和门禁串联统一启动层，不替换它们的状态协调。 */
function Harness({ ready = false }: { ready?: boolean }) {
  return (
    <StrictMode>
      <StartupProgressProvider
        active
        authentication={{ status: 'completed' }}
        workspaceInitialization={{ status: 'completed' }}
      >
        <AccountPreferencesProvider>
          <OnboardingGate>
            <Workspace ready={ready} />
          </OnboardingGate>
        </AccountPreferencesProvider>
      </StartupProgressProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  delete window.threadlineDesktop;
});
afterEach(() => {
  cleanup();
  delete window.threadlineDesktop;
});

it('keeps one startup screen through slow profile, native state and workspace reads', async () => {
  const profile = deferred<{ data: AccountPreferences; error: null }>();
  const autoStart = deferred<AutoStartState>();
  fixture.read.mockReturnValue(profile.promise);
  const readAutoStart = vi.fn(() => autoStart.promise);
  installAutoStartReader(readAutoStart);
  const view = render(<Harness />);
  const startup = screen.getByLabelText('Threadline 启动进度');
  expect(screen.queryByText('正在准备你的工作台')).not.toBeInTheDocument();
  expect(screen.queryByText('工作台内容')).not.toBeInTheDocument();

  await act(async () => profile.resolve({ data: completedProfile, error: null }));
  expect(screen.getByLabelText('Threadline 启动进度')).toBe(startup);
  expect(screen.queryByText('正在准备你的工作台')).not.toBeInTheDocument();
  expect(screen.queryByText('工作台内容')).not.toBeInTheDocument();

  await act(async () => autoStart.resolve(decidedAutoStart));
  expect(screen.getByText('工作台内容')).toBeInTheDocument();
  expect(screen.getByLabelText('Threadline 启动进度')).toBe(startup);
  expect(screen.queryByLabelText('首次使用设置')).not.toBeInTheDocument();

  view.rerender(<Harness ready />);
  expect(screen.queryByLabelText('Threadline 启动进度')).not.toBeInTheDocument();
  const previousReads = fixture.read.mock.calls.length;
  fixture.read.mockRejectedValueOnce(new Error('background profile offline'));
  readAutoStart.mockRejectedValueOnce(new Error('background native state denied'));
  await act(async () => fireEvent.focus(window));
  await waitFor(() => expect(fixture.read).toHaveBeenCalledTimes(previousReads + 1));
  expect(screen.getByText('工作台内容')).toBeInTheDocument();
  expect(screen.queryByLabelText('Threadline 启动进度')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('首次使用设置')).not.toBeInTheDocument();
  expect(screen.queryByText('正在准备你的工作台')).not.toBeInTheDocument();
});

it('retains the local waiting card when no shared startup runtime is mounted', async () => {
  const profile = deferred<{ data: AccountPreferences; error: null }>();
  const autoStart = deferred<AutoStartState>();
  fixture.read.mockReturnValue(profile.promise);
  installAutoStartReader(() => autoStart.promise);
  render(
    <AccountPreferencesProvider>
      <OnboardingGate>
        <p>工作台内容</p>
      </OnboardingGate>
    </AccountPreferencesProvider>,
  );
  expect(screen.getByText('正在准备你的工作台')).toBeInTheDocument();
  expect(screen.queryByText('工作台内容')).not.toBeInTheDocument();
  await act(async () => {
    profile.resolve({ data: completedProfile, error: null });
    autoStart.resolve(decidedAutoStart);
  });
  expect(screen.getByText('工作台内容')).toBeInTheDocument();
});

it('reveals actual first-use steps once required preferences have loaded', async () => {
  const profile = deferred<{ data: AccountPreferences; error: null }>();
  fixture.read.mockReturnValue(profile.promise);
  installAutoStartReader(async () => decidedAutoStart);
  render(<Harness />);
  expect(screen.getByLabelText('Threadline 启动进度')).toBeInTheDocument();
  await act(async () =>
    profile.resolve({
      data: { ...completedProfile, gender: null, onboarding_completed_at: null },
      error: null,
    }),
  );
  expect(await screen.findByText('选择喜欢的主题')).toBeInTheDocument();
  expect(screen.queryByLabelText('Threadline 启动进度')).not.toBeInTheDocument();
  expect(screen.queryByText('工作台内容')).not.toBeInTheDocument();
});

it('keeps a profile read failure, retry and sign-out visible above the loading layer', async () => {
  const profile = deferred<{ data: AccountPreferences; error: null }>();
  fixture.read.mockReturnValue(profile.promise);
  installAutoStartReader(async () => decidedAutoStart);
  render(<Harness />);
  await act(async () => profile.reject(new Error('profile offline')));
  expect(await screen.findByRole('alert')).toHaveTextContent('profile offline');
  expect(screen.queryByLabelText('Threadline 启动进度')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '退出账号' })).toBeInTheDocument();
  fixture.read.mockResolvedValue({ data: completedProfile, error: null });
  fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
  await screen.findByText('工作台内容');
  expect(screen.getByLabelText('Threadline 启动进度')).toBeInTheDocument();
  expect(screen.queryByText('正在准备你的工作台')).not.toBeInTheDocument();
});

it('keeps a native state failure actionable and resumes startup after retry', async () => {
  const autoStart = deferred<AutoStartState>();
  fixture.read.mockResolvedValue({ data: completedProfile, error: null });
  const read = vi.fn(() => autoStart.promise);
  installAutoStartReader(read);
  render(<Harness />);
  await act(async () => autoStart.reject(new Error('native settings denied')));
  expect(await screen.findByRole('alert')).toHaveTextContent('native settings denied');
  expect(screen.queryByLabelText('Threadline 启动进度')).not.toBeInTheDocument();
  read.mockResolvedValue(decidedAutoStart);
  fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
  await screen.findByText('工作台内容');
  expect(screen.getByLabelText('Threadline 启动进度')).toBeInTheDocument();
});
