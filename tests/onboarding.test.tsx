/** @fileoverview 使用真实 Preview 偏好与引导组件验证两步流程、完成持久化和启动遮罩协调。 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  AccountPreferencesProvider,
  previewPreferencesKey,
} from '@/features/onboarding/account-preferences-provider';
import { OnboardingGate } from '@/features/onboarding/onboarding-gate';
import { StartupProgressProvider } from '@/features/startup/startup-progress-context';
import { useOptionalStartupProgress } from '@/features/startup/startup-progress-context';
import { useEffect } from 'react';
import type { ThreadlineDesktopBridge } from '@/lib/desktop-bridge';

vi.mock('@/features/auth/cloud-runtime-provider', () => ({
  useOptionalCloudRuntime: () => null,
}));
vi.mock('@/features/appearance/cottage-scene', () => ({
  CottageScene: () => <span />,
}));
vi.mock('@/components/desktop-entry-chrome', () => ({
  DesktopEntryChrome: () => null,
}));
/** 工作台仅在门禁放行后汇报数据加载完成，模拟生产 Provider 协作。 */
function Workspace() {
  const progress = useOptionalStartupProgress();
  useEffect(() => {
    progress?.setWorkspaceDataStatus({ status: 'completed' });
  }, [progress]);
  return <p>工作台内容</p>;
}
/** 同时挂载真实启动遮罩，防止引导在后台被它永久遮挡。 */
function Harness() {
  return (
    <StartupProgressProvider
      active
      authentication={{ status: 'completed' }}
      workspaceInitialization={{ status: 'completed' }}
    >
      <AccountPreferencesProvider>
        <OnboardingGate>
          <Workspace />
        </OnboardingGate>
      </AccountPreferencesProvider>
    </StartupProgressProvider>
  );
}
beforeEach(() => {
  localStorage.clear();
  delete window.threadlineDesktop;
  localStorage.setItem(
    previewPreferencesKey,
    JSON.stringify({
      owner_id: 'preview',
      gender: null,
      preferences_version: 0,
      onboarding_completed_at: null,
    }),
  );
});
afterEach(cleanup);

/** 仅模拟安装版受限 bridge，不调用真实 Windows 启动项。 */
function installDesktopBridge() {
  let state = { supported: true, enabled: false, decided: false };
  const set = vi.fn(
    async (enabled: boolean) => (state = { ...state, enabled, decided: true }),
  );
  const defer = vi.fn(async () => (state = { ...state, decided: true }));
  window.threadlineDesktop = {
    environment: 'electron',
    role: 'main',
    getAutoStartState: async () => state,
    setAutoStartEnabled: set,
    deferAutoStart: defer,
  } as unknown as ThreadlineDesktopBridge;
  return { set, defer };
}

it('shows three steps on Windows, defaults off and defers without enabling', async () => {
  const bridge = installDesktopBridge();
  render(<Harness />);
  await screen.findByText('第 1 步，共 3 步');
  fireEvent.click(screen.getByRole('button', { name: '继续' }));
  fireEvent.click(screen.getByLabelText('男生'));
  fireEvent.click(screen.getByRole('button', { name: '继续' }));
  await screen.findByText('第 3 步，共 3 步');
  expect(screen.getByRole('switch')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '以后再选' }));
  await screen.findByText('工作台内容');
  expect(bridge.set).not.toHaveBeenCalled();
  expect(bridge.defer).toHaveBeenCalledOnce();
});

it('asks only for this device when the account has already completed onboarding', async () => {
  installDesktopBridge();
  localStorage.setItem(
    previewPreferencesKey,
    JSON.stringify({
      owner_id: 'preview',
      gender: 'female',
      preferences_version: 2,
      onboarding_completed_at: '2026-09-20T00:00:00Z',
    }),
  );
  render(<Harness />);
  await screen.findByText('第 1 步，共 1 步');
  expect(screen.queryByText('选择喜欢的主题')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '以后再选' }));
  await screen.findByText('工作台内容');
  expect(
    JSON.parse(localStorage.getItem(previewPreferencesKey)!).preferences_version,
  ).toBe(2);
});

it('allows deferring after a failed native enable without completing early', async () => {
  const bridge = installDesktopBridge();
  bridge.set.mockRejectedValueOnce(new Error('system denied'));
  render(<Harness />);
  await screen.findByText('选择喜欢的主题');
  fireEvent.click(screen.getByRole('button', { name: '继续' }));
  fireEvent.click(screen.getByLabelText('女生'));
  fireEvent.click(screen.getByRole('button', { name: '继续' }));
  await screen.findByRole('switch');
  fireEvent.click(screen.getByRole('switch'));
  fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));
  await screen.findByText('system denied');
  expect(screen.queryByText('工作台内容')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '以后再选' }));
  await screen.findByText('工作台内容');
});
it('requires gender, allows returning and persists completion without repeating', async () => {
  const view = render(<Harness />);
  await screen.findByText('选择喜欢的主题');
  expect(screen.queryByText('工作台内容')).not.toBeInTheDocument();
  expect(screen.queryByText('加载工作区数据')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '继续' }));
  expect(screen.getByRole('button', { name: '进入工作台' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('男生'));
  fireEvent.click(screen.getByRole('button', { name: '上一步' }));
  fireEvent.click(screen.getByRole('button', { name: '继续' }));
  expect(screen.getByLabelText('男生')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));
  await screen.findByText('工作台内容');
  expect(JSON.parse(localStorage.getItem(previewPreferencesKey)!).gender).toBe('male');
  view.unmount();
  render(<Harness />);
  await screen.findByText('工作台内容');
  expect(screen.queryByText('选择喜欢的主题')).not.toBeInTheDocument();
});
it('retains the gender draft and does not complete when persistence fails', async () => {
  render(<Harness />);
  await screen.findByText('选择喜欢的主题');
  fireEvent.click(screen.getByRole('button', { name: '继续' }));
  fireEvent.click(screen.getByLabelText('女生'));
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));
  await screen.findByText('storage unavailable');
  expect(screen.getByLabelText('女生')).toBeChecked();
  expect(screen.queryByText('工作台内容')).not.toBeInTheDocument();
  spy.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));
  await waitFor(() => expect(screen.getByText('工作台内容')).toBeInTheDocument());
});
