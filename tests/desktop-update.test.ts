/** @fileoverview 验证更新并发、失败恢复、版本筛选和用户安装确认，不下载或安装真实软件。 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { AppUpdater } from 'electron-updater';
import { UpdateController } from '@/lib/desktop-update-controller';

/** 用可控 promise 和真实事件模拟 updater 边界。 */
function setup(version = '0.1.2', enabled = true) {
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn(async () => ({ updateInfo: { version } })),
    downloadUpdate: vi.fn(async () => ['installer.exe']),
  });
  const publish = vi.fn();
  const controller = new UpdateController(
    updater as unknown as AppUpdater,
    '0.1.1',
    enabled,
    publish,
  );
  return { updater, controller, publish };
}
describe('desktop updater', () => {
  it.each(['0.1.0', '0.1.1', '0.0.99', '0.1.2-beta.1'])(
    'ignores non-upgrade %s',
    async (version) => {
      const { controller } = setup(version);
      expect((await controller.check()).status).toBe('current');
    },
  );
  it('disables directory packages and premature install', async () => {
    const { controller, updater } = setup('0.1.2', false);
    await controller.check();
    await controller.download();
    const confirm = vi.fn();
    await controller.install(confirm, vi.fn());
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
  it('keeps one download active and emits progress, then waits for confirmation', async () => {
    const { controller, updater } = setup();
    await controller.check();
    let finish!: (files: string[]) => void;
    updater.downloadUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = controller.download();
    await controller.download();
    await controller.check();
    updater.emit('download-progress', { percent: 42 });
    expect(controller.getState().percent).toBe(42);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    finish(['installer']);
    await first;
    await controller.check();
    expect(controller.getState().status).toBe('downloaded');
    const quit = vi.fn();
    await controller.install(async () => false, quit);
    expect(quit).not.toHaveBeenCalled();
    await controller.install(async () => true, quit);
    expect(quit).toHaveBeenCalledOnce();
    updater.emit('error', new Error('spawn failed'));
    expect(controller.getState().status).toBe('downloaded');
  });
  it('recovers from offline checks and failed verification', async () => {
    const { controller, updater } = setup();
    updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
    expect((await controller.check()).status).toBe('error');
    expect((await controller.check()).status).toBe('available');
    updater.downloadUpdate.mockRejectedValueOnce(new Error('checksum'));
    expect((await controller.download()).status).toBe('error');
    await controller.check();
    expect((await controller.download()).status).toBe('downloaded');
  });
});
