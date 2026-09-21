/** @fileoverview Windows 安装版专用自启动 IPC；固定程序路径及当前用户注册表项，禁止 Renderer 指定命令。 */
import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAutoStartController } from '../src/lib/desktop-auto-start.js';

/** Main ready 后注册，复用窗口身份校验；未安装的 Preview/开发版不会写系统设置。 */
export function registerAutoStart(trusted: (event: IpcMainInvokeEvent) => boolean) {
  const decisionPath = join(app.getPath('userData'), 'auto-start-choice.json');
  const options = { path: process.execPath, args: [] as string[] };
  const controller = createAutoStartController({
    supported:
      process.platform === 'win32' &&
      app.isPackaged &&
      existsSync(join(process.resourcesPath, 'threadline-installed')),
    readEnabled: () => app.getLoginItemSettings(options).executableWillLaunchAtLogin,
    writeEnabled: (enabled) =>
      app.setLoginItemSettings({
        ...options,
        name: 'com.doris619619.threadline',
        openAtLogin: enabled,
        enabled,
      }),
    readDecision: () => {
      try {
        return JSON.parse(readFileSync(decisionPath, 'utf8')).decided === true;
      } catch {
        return false;
      }
    },
    recordDecision: () =>
      writeFileSync(decisionPath, JSON.stringify({ decided: true }), 'utf8'),
  });
  for (const [channel, handler] of Object.entries({
    'desktop:auto-start-get': () => controller.getState(),
    'desktop:auto-start-set': (enabled: unknown) => controller.setEnabled(enabled),
    'desktop:auto-start-defer': () => controller.defer(),
  })) {
    ipcMain.handle(channel, (event, value: unknown) => {
      if (!trusted(event)) throw new Error('Rejected auto-start sender');
      return handler(value);
    });
  }
}
