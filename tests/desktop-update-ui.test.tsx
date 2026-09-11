/** @fileoverview 验证更新入口的迟到快照、保存保护、持续提示与 Web 隐藏行为。 */
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  DesktopUpdateRuntime,
  UpdateControls,
} from '@/features/desktop-update/update-runtime';
import { beginCloudWrite } from '@/lib/cloud-write-guard';
import type { DesktopUpdateState } from '@/lib/desktop-update';
import { DesktopUpdateEntry } from '@/features/desktop-update/update-entry';
afterEach(() => {
  cleanup();
  delete window.threadlineDesktop;
});
it('hides updater on the web', () => {
  render(
    <DesktopUpdateRuntime>
      <UpdateControls />
      <DesktopUpdateEntry />
    </DesktopUpdateRuntime>,
  );
  expect(screen.queryByText('检查更新')).toBeNull();
  expect(screen.queryByLabelText('软件更新')).toBeNull();
});
it('only opens details on request and stays quiet through version changes and download completion', async () => {
  let apply!: (state: DesktopUpdateState) => void;
  const state: DesktopUpdateState = {
    status: 'available',
    revision: 1,
    currentVersion: '0.1.3',
    version: '0.1.4',
  };
  const downloadUpdate = vi.fn(async () => ({
    ...state,
    revision: 2,
    status: 'downloading' as const,
    percent: 25,
  }));
  Object.defineProperty(window, 'threadlineDesktop', {
    configurable: true,
    value: {
      environment: 'electron',
      role: 'main',
      getUpdateState: async () => state,
      onUpdateState: (listener: typeof apply) => {
        apply = listener;
        return () => undefined;
      },
      downloadUpdate,
    },
  });
  const view = render(
    <DesktopUpdateRuntime>
      <DesktopUpdateEntry />
      <p>首页</p>
    </DesktopUpdateRuntime>,
  );
  const entry = await screen.findByRole('button', { name: '软件更新：更新' });
  expect(screen.queryByRole('region', { name: '软件更新详情' })).toBeNull();
  fireEvent.click(entry);
  fireEvent.click(screen.getByRole('button', { name: '下载更新' }));
  expect(await screen.findByRole('progressbar')).toHaveAttribute('value', '25');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(entry).toHaveFocus();
  act(() => apply({ ...state, revision: 3, status: 'downloaded' }));
  view.rerender(
    <DesktopUpdateRuntime>
      <DesktopUpdateEntry />
      <p>项目</p>
    </DesktopUpdateRuntime>,
  );
  expect(screen.queryByRole('region', { name: '软件更新详情' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '软件更新：重启更新' }));
  expect(screen.getByRole('button', { name: '重启并更新' })).toBeEnabled();
  fireEvent.pointerDown(document.body);
  act(() => apply({ ...state, revision: 4, version: '0.1.5' }));
  expect(screen.queryByRole('region', { name: '软件更新详情' })).toBeNull();
  act(() =>
    apply({ ...state, revision: 5, status: 'error', message: '下载失败，请重试。' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '软件更新：更新' }));
  expect(screen.getByText('下载失败，请重试。')).toBeVisible();
  expect(screen.getByRole('button', { name: '检查更新' })).toBeEnabled();
});
it('ignores late idle state and disables restart during an actual queued save', async () => {
  let apply!: (state: DesktopUpdateState) => void;
  let initial!: (state: DesktopUpdateState) => void;
  const installUpdate = vi.fn(async () => ({
    status: 'downloaded',
    revision: 5,
    currentVersion: '0.1.1',
    version: '0.1.2',
  }));
  Object.defineProperty(window, 'threadlineDesktop', {
    configurable: true,
    value: {
      environment: 'electron',
      role: 'main',
      onUpdateState: (listener: typeof apply) => {
        apply = listener;
        return () => undefined;
      },
      getUpdateState: () =>
        new Promise((resolve) => {
          initial = resolve;
        }),
      installUpdate,
    },
  });
  render(
    <DesktopUpdateRuntime>
      <UpdateControls />
    </DesktopUpdateRuntime>,
  );
  await act(async () => {
    apply({
      status: 'downloaded',
      revision: 4,
      currentVersion: '0.1.1',
      version: '0.1.2',
    });
    initial({ status: 'idle', revision: 0, currentVersion: '0.1.1' });
  });
  await waitFor(() =>
    expect(screen.getAllByText('重启并更新').length).toBeGreaterThan(0),
  );
  let end!: () => void;
  act(() => {
    end = beginCloudWrite();
  });
  for (const button of screen.getAllByText('重启并更新')) {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(installUpdate).not.toHaveBeenCalled();
  act(() => end());
  expect(screen.getAllByText('重启并更新')[0]).toBeEnabled();
  fireEvent.click(screen.getAllByText('重启并更新')[0]);
  const dialog = await screen.findByRole('dialog', { name: '重启并更新' });
  expect(installUpdate).not.toHaveBeenCalled();
  fireEvent.click(dialog.querySelector('[data-management-initial-focus]')!);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getAllByText('重启并更新')[0]);
  const confirm = await screen.findByRole('dialog', { name: '重启并更新' });
  fireEvent.click(
    [...confirm.querySelectorAll('button')].find(
      (button) => button.textContent === '重启并更新',
    )!,
  );
  await waitFor(() => expect(installUpdate).toHaveBeenCalledOnce());
});
