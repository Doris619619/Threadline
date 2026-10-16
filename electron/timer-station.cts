/** @fileoverview 独立计时站的原生窗口生命周期；只开放同源展示页与有限窗口控制，不持有计时业务状态。 */
import { BrowserWindow, ipcMain, screen } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { createStationGeometry } from './timer-station-geometry.cjs';

type Layout = 'horizontal' | 'vertical';
let station: BrowserWindow | undefined;
let owner: BrowserWindow | undefined;
let stationUrl = '';
let geometry: ReturnType<typeof createStationGeometry> | undefined;
let configured = false;

/** 主窗口或计时站的顶层可信 frame 才可控制这个窗口；拒绝子 frame 和其他窗口。 */
function trusted(event: IpcMainInvokeEvent): boolean {
  const window = BrowserWindow.fromWebContents(event.sender);
  return (
    !!window &&
    (window === owner || window === station) &&
    event.senderFrame === event.sender.mainFrame &&
    (window === owner || event.senderFrame?.url === stationUrl)
  );
}

/** 仅注册一次受限窗口命令；显示器恢复和尺寸记忆由独立几何模块处理。 */
export function registerTimerStationIpc(): void {
  /** 拔下外接屏后将计时站移回仍可见的工作区，不影响工作站的独立几何。 */
  const recoverDisplay = () => geometry?.recover();
  screen.on('display-removed', recoverDisplay);
  screen.on('display-metrics-changed', recoverDisplay);
  ipcMain.handle('desktop:timer-station', (event, command: unknown) => {
    if (!trusted(event) || !station || station.isDestroyed())
      throw new Error('计时站尚未打开');
    if (!command || typeof command !== 'object') throw new Error('无效计时站命令');
    const value = command as Record<string, unknown>;
    if (value.action === 'configure') {
      if (
        !['horizontal', 'vertical'].includes(value.layout as string) ||
        !Number.isInteger(value.count) ||
        Number(value.count) < 0 ||
        Number(value.count) > 3 ||
        typeof value.pinned !== 'boolean'
      )
        throw new Error('无效计时站配置');
      geometry?.configure(value.layout as Layout, Number(value.count));
      station.setAlwaysOnTop(value.pinned);
      if (!configured) station.show();
      configured = true;
    } else if (value.action === 'minimize') station.minimize();
    else if (value.action === 'close') station.close();
    else if (value.action === 'focus') {
      if (station.isMinimized()) station.restore();
      station.show();
      station.focus();
    } else throw new Error('未知计时站命令');
  });
}

/** Electron 同源子窗口由父 React portal 渲染；关闭/重载父窗口会销毁展示，避免留下旧账号内容。 */
export function attachTimerStation(
  main: BrowserWindow,
  url: string,
  preload: string,
  icon: string,
): void {
  owner = main;
  stationUrl = url;
  main.webContents.setWindowOpenHandler((details) => {
    if (
      details.url !== url ||
      details.frameName !== 'threadline-timer-station' ||
      details.postBody ||
      station
    )
      return { action: 'deny' };
    const mainBounds = main.getBounds();
    const area = screen.getDisplayMatching(mainBounds).workArea;
    const width = Math.min(940, area.width);
    return {
      action: 'allow',
      outlivesOpener: false,
      overrideBrowserWindowOptions: {
        title: '计时站 · Threadline',
        icon,
        frame: false,
        show: false,
        width,
        height: Math.min(208, area.height),
        x: Math.max(
          area.x,
          Math.min(mainBounds.x + mainBounds.width + 12, area.x + area.width - width),
        ),
        y: Math.max(
          area.y,
          Math.min(mainBounds.y, area.y + area.height - Math.min(208, area.height)),
        ),
        resizable: true,
        minWidth: Math.min(340, area.width),
        minHeight: Math.min(208, area.height),
        maximizable: false,
        fullscreenable: false,
        backgroundColor: '#faf8f3',
        autoHideMenuBar: true,
        webPreferences: {
          preload,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      },
    };
  });
  main.webContents.on('did-create-window', (child) => {
    station = child;
    geometry = createStationGeometry(child);
    configured = false;
    // 时钟运行在父会话；父窗口最小化/贴边隐藏时也必须每秒刷新可见计时站。
    const previousThrottling = main.webContents.getBackgroundThrottling();
    main.webContents.setBackgroundThrottling(false);
    child.webContents.setZoomMode('isolated');
    child.webContents.setZoomFactor(1);
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // window.open 的首次导航发生在 did-create-window 之后；只放行这一个精确 URL。
    child.webContents.on('will-navigate', (event, target) => {
      if (target !== url) event.preventDefault();
    });
    child.webContents.on('will-redirect', (event) => event.preventDefault());
    child.webContents.on('render-process-gone', () => child.destroy());
    child.on('closed', () => {
      if (station === child) {
        station = undefined;
        geometry = undefined;
        configured = false;
      }
      if (!main.isDestroyed() && !main.webContents.isDestroyed())
        main.webContents.setBackgroundThrottling(previousThrottling);
    });
  });
  /** 文档重载或退出清理子窗口；普通 React 视图切换不会触发此事件。 */
  const close = () => {
    if (owner === main && station && !station.isDestroyed()) station.destroy();
  };
  main.on('closed', close);
  main.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace) close();
  });
}
