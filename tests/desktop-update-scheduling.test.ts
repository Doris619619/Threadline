/** @fileoverview 编译实际 Main 更新模块，在隔离上下文中验证启动、焦点、恢复和退出事件。 */
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { UpdateController } from '@/lib/desktop-update-controller';

const code = ts.transpileModule(readFileSync('electron/desktop-updates.cts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
afterEach(() => vi.useRealTimers());

it('automatically checks on startup, stale main focus, resume and interval, and cleans up on quit', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const app = Object.assign(new EventEmitter(), {
    isPackaged: true,
    getVersion: () => '0.1.3',
  });
  const powerMonitor = new EventEmitter();
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '0.1.3' } })),
  });
  const modules: Record<string, unknown> = {
    electron: { app, powerMonitor, ipcMain: { handle: vi.fn() } },
    'electron-updater': { autoUpdater: updater },
    'node:fs': { existsSync: () => true },
    'node:path': { join },
    '../src/lib/desktop-update-controller.js': { UpdateController },
  };
  const compiled = {
    exports: {} as {
      registerDesktopUpdates: (
        getWindow: () => unknown,
        trusted: () => boolean,
      ) => void;
    },
  };
  runInNewContext(code, {
    module: compiled,
    exports: compiled.exports,
    require: (id: string) => modules[id],
    process: { platform: 'win32', resourcesPath: 'test-resources' },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
  });
  const window = { isDestroyed: () => false, webContents: { send: vi.fn() } };
  compiled.exports.registerDesktopUpdates(
    () => window,
    () => true,
  );
  app.emit('browser-window-focus', {}, window);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(updater.checkForUpdates).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  app.emit('browser-window-focus', {}, window);
  powerMonitor.emit('resume');
  await vi.advanceTimersByTimeAsync(0);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3_600_000);
  app.emit('browser-window-focus', {}, {});
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  app.emit('browser-window-focus', {}, window);
  await vi.advanceTimersByTimeAsync(0);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(3_600_000);
  powerMonitor.emit('resume');
  await vi.advanceTimersByTimeAsync(0);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(4 * 3_600_000);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(4);
  app.emit('before-quit');
  await vi.advanceTimersByTimeAsync(6 * 3_600_000);
  app.emit('browser-window-focus', {}, window);
  powerMonitor.emit('resume');
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(4);
  expect(app.listenerCount('browser-window-focus')).toBe(0);
  expect(powerMonitor.listenerCount('resume')).toBe(0);
});
