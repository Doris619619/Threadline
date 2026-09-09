/** @fileoverview 验证更新入口的迟到快照、保存保护和 Web 隐藏行为。 */
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
afterEach(() => {
  cleanup();
  delete window.threadlineDesktop;
});
it('hides updater on the web', () => {
  render(
    <DesktopUpdateRuntime>
      <UpdateControls />
    </DesktopUpdateRuntime>,
  );
  expect(screen.queryByText('检查更新')).toBeNull();
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
