/** @fileoverview 注册安装版专用更新 IPC、后台检查与用户确认；发布地址由打包配置固定。 */
import {
  app,
  ipcMain,
  powerMonitor,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { UpdateController } from '../src/lib/desktop-update-controller.js';

/** 在主窗口创建前注册一次；更新退出沿用 app.quit 的 before-quit 生命周期。 */
export function registerDesktopUpdates(
  getWindow: () => BrowserWindow | undefined,
  trusted: (event: IpcMainInvokeEvent) => boolean,
) {
  const enabled =
    process.platform === 'win32' &&
    app.isPackaged &&
    existsSync(join(process.resourcesPath, 'threadline-installed'));
  const controller = new UpdateController(
    autoUpdater,
    app.getVersion(),
    enabled,
    (state) => {
      const window = getWindow();
      if (window && !window.isDestroyed())
        window.webContents.send('desktop:update-state', state);
    },
  );
  const handlers = {
    'desktop:update-get': () => controller.getState(),
    'desktop:update-check': () => controller.check(),
    'desktop:update-download': () => controller.download(),
    'desktop:update-install': () =>
      controller.install(
        async () => {
          const window = getWindow();
          if (!window || window.isDestroyed()) return false;
          // 确认和保存保护由可信 Renderer 的模态完成；安装前再次验证窗口存活。
          return true;
        },
        () => {
          setImmediate(() => autoUpdater.quitAndInstall(true, true));
        },
      ),
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event) => {
      if (!trusted(event)) throw new Error('Rejected update sender');
      return handler();
    });
  }
  if (enabled) {
    // 首次启动留出加载时间；焦点与恢复事件共用节流，避免频繁切窗重复请求。
    const readyAt = Date.now() + 30_000;
    /** 后台检查不清除已有新版；手动请求也计入一小时冷却。 */
    const checkInBackground = () => {
      if (Date.now() >= readyAt) void controller.check(60 * 60 * 1000);
    };
    /** 只响应主窗口，排除 Edge 等辅助窗口的焦点变化。 */
    const onFocus = (_event: Electron.Event, window: BrowserWindow) => {
      if (window === getWindow()) checkInBackground();
    };
    const initial = setTimeout(checkInBackground, 30_000);
    const interval = setInterval(checkInBackground, 6 * 60 * 60 * 1000);
    app.on('browser-window-focus', onFocus);
    powerMonitor.on('resume', checkInBackground);
    app.once('before-quit', () => {
      clearTimeout(initial);
      clearInterval(interval);
      app.removeListener('browser-window-focus', onFocus);
      powerMonitor.removeListener('resume', checkInBackground);
    });
  }
}
