/** @fileoverview 通过真实壳层、窗口 Provider 和启动桥接复现收起恢复死锁，验证数据层不被卸载。 */
import { useEffect } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/app-shell';
import { DesktopWindowProvider } from '@/lib/desktop-window-context';
import type {
  ThreadlineDesktopBridge,
  DesktopHydrationPayload,
} from '@/lib/desktop-bridge';
import {
  StartupProgressProvider,
  useOptionalStartupProgress,
} from '@/features/startup/startup-progress-context';

/** 数据请求的完成由测试控制，确保持久窗口状态先恢复而查询仍未完成。 */
function DataReporter({ ready, unmount }: { ready: boolean; unmount: () => void }) {
  const report = useOptionalStartupProgress()!.setWorkspaceDataStatus;
  useEffect(() => {
    report({ status: ready ? 'completed' : 'active' });
  }, [ready, report]);
  useEffect(() => unmount, [unmount]);
  return <p data-testid="data-consumer">业务数据</p>;
}
/** 复用生产 Provider 的嵌套关系，不能把 AppShell 换成恒定 children 的 mock。 */
function Harness({ ready, unmount }: { ready: boolean; unmount: () => void }) {
  return (
    <StartupProgressProvider
      active
      authentication={{ status: 'completed' }}
      workspaceInitialization={{ status: 'completed' }}
    >
      <DesktopWindowProvider>
        <AppShell>
          <DataReporter ready={ready} unmount={unmount} />
        </AppShell>
      </DesktopWindowProvider>
    </StartupProgressProvider>
  );
}
afterEach(() => {
  cleanup();
  delete window.threadlineDesktop;
  localStorage.clear();
});

it('finishes data loading before restoring a persisted collapsed workstation', async () => {
  localStorage.setItem('threadline.desktop-mode.v3', '"workstation"');
  localStorage.setItem(
    'threadline.desktop-compact-presentation.v3',
    '"edge-collapsed"',
  );
  const hydrate = vi.fn(async (payload: DesktopHydrationPayload) => ({
    ...payload,
    stateRevision: 1,
    geometry: { width: 200, height: 300 },
    visibleSurface: 'edge',
    fallback: false,
  }));
  window.threadlineDesktop = {
    environment: 'electron',
    role: 'main',
    hydrateDesktopState: hydrate,
    showEntryWindow: vi.fn().mockResolvedValue(undefined),
    getMainWindowMaximized: vi.fn().mockResolvedValue(false),
    onNativeStateChanged: () => () => {},
    onNativeGeometryChanged: () => () => {},
    onMainWindowMaximizeChanged: () => () => {},
    onPresentationRollback: () => () => {},
  } as unknown as ThreadlineDesktopBridge;
  const unmount = vi.fn();
  const view = render(<Harness ready={false} unmount={unmount} />);
  await screen.findByRole('button', { name: '展开紧凑工作台' });
  expect(hydrate).not.toHaveBeenCalled();
  expect(unmount).not.toHaveBeenCalled();
  expect(screen.getByTestId('data-consumer')).toBeInTheDocument();
  view.rerender(<Harness ready unmount={unmount} />);
  await waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
  expect(hydrate.mock.calls[0][0]).toMatchObject({
    mode: 'workstation',
    presentation: 'edge-collapsed',
  });
  expect(screen.queryByLabelText('Threadline 启动进度')).not.toBeInTheDocument();
  expect(unmount).not.toHaveBeenCalled();
});
