/**
 * @fileoverview Electron Main 进程：受限 Renderer 加载、启动 hydration handshake 与安全首次 reveal。
 */

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  screen,
  type IpcMainInvokeEvent,
} from 'electron';
import { existsSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_PROTOCOL = 'threadline';
const APP_HOST = 'app';
const DEFAULT_RENDERER_URL = 'http://127.0.0.1:3118';
const STARTUP_TIMEOUT_MS = 8_000;
type DesktopViewMode = 'full' | 'mini-today' | 'workstation';
type CompactViewMode = Exclude<DesktopViewMode, 'full'>;
type CompactPresentation = 'expanded' | 'edge-collapsed';
type WindowRole = 'main' | 'edge-tab';
type WindowStateConfig = { width: number; height: number; x?: number; y?: number };
type DesktopHydrationPayload = {
  requestId: number;
  mode: DesktopViewMode;
  presentation: CompactPresentation;
  lastCompactMode: CompactViewMode;
  windowStates: Partial<Record<DesktopViewMode, WindowStateConfig>>;
};
type NativeApplyResult = {
  requestId: number;
  mode: DesktopViewMode;
  presentation: CompactPresentation;
  geometry: WindowStateConfig;
  visibleSurface: 'main' | 'edge';
  fallback: boolean;
  reason?: string;
};

const DEFAULT_WINDOW_CONFIGS: Record<DesktopViewMode, WindowStateConfig> = {
  full: { width: 1280, height: 840 },
  'mini-today': { width: 420, height: 660 },
  workstation: { width: 300, height: 420 },
};
const EDGE_TAB_SIZE = { width: 42, height: 146 };

let mainWindow: BrowserWindow | undefined;
let edgeWindow: BrowserWindow | undefined;
let mainReadyToShow = false;
let startupWatchdog: ReturnType<typeof setTimeout> | undefined;
let latestRequestId = 0;
let nativeRevision = 0;
let suppressGeometryUntil = 0;
let userGeometryTimer: ReturnType<typeof setTimeout> | undefined;
let latestState: DesktopHydrationPayload = {
  requestId: 0,
  mode: 'full',
  presentation: 'expanded',
  lastCompactMode: 'mini-today',
  windowStates: {},
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: { secure: true, standard: true, supportFetchAPI: true },
  },
]);

/** 返回打包应用中静态 Next export 的绝对目录。 */
function getRendererDirectory(): string {
  return join(app.getAppPath(), '.next-electron');
}

/** 返回唯一允许的开发或生产 Renderer URL，并按窗口角色添加只读标记。 */
function getRendererUrl(role: WindowRole): string {
  const baseUrl = app.isPackaged
    ? `${APP_PROTOCOL}://${APP_HOST}/`
    : (process.env.THREADLINE_ELECTRON_RENDERER_URL ?? DEFAULT_RENDERER_URL);
  const url = new URL(baseUrl);
  url.searchParams.set('threadline-role', role);
  return url.toString();
}

/** 将受限 protocol 请求映射到静态 export 文件，并拒绝错误 host 与路径穿越。 */
function resolveRendererAsset(requestUrl: string): string {
  const request = new URL(requestUrl);
  if (request.protocol !== `${APP_PROTOCOL}:` || request.host !== APP_HOST) {
    throw new Error(`Rejected renderer protocol request: ${requestUrl}`);
  }
  const relativePath = decodeURIComponent(
    request.pathname === '/' ? '/index.html' : request.pathname,
  ).replace(/^[/\\]+/, '');
  const rendererDirectory = getRendererDirectory();
  const assetPath = resolve(rendererDirectory, normalize(relativePath));
  if (
    assetPath !== rendererDirectory &&
    !assetPath.startsWith(`${rendererDirectory}${sep}`)
  ) {
    throw new Error(`Rejected renderer path traversal: ${requestUrl}`);
  }
  return assetPath;
}

/** 注册生产静态资源协议，使 Renderer 不需要 file:// 或 Node 访问权限。 */
function registerRendererProtocol(): void {
  protocol.handle(APP_PROTOCOL, async (request) => {
    const assetPath = resolveRendererAsset(request.url);
    if (!existsSync(assetPath)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(assetPath).toString());
  });
}

/** 判断 renderer URL 是否属于当前开发地址或受限生产 protocol。 */
function isTrustedRendererUrl(url: string): boolean {
  try {
    const actual = new URL(url);
    if (app.isPackaged) {
      return actual.protocol === `${APP_PROTOCOL}:` && actual.host === APP_HOST;
    }
    const expected = new URL(
      process.env.THREADLINE_ELECTRON_RENDERER_URL ?? DEFAULT_RENDERER_URL,
    );
    return actual.protocol === expected.protocol && actual.host === expected.host;
  } catch {
    return false;
  }
}

/** 阻止 Renderer 打开未审核的新窗口或离开桌面壳允许的页面来源。 */
function protectRendererNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
}

/** 创建受保护 BrowserWindow；角色只通过 preload 的 additionalArguments 传递。 */
function createWindow(
  role: WindowRole,
  options: Electron.BrowserWindowConstructorOptions,
): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    ...options,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--threadline-role=${role}`],
    },
  });
  protectRendererNavigation(window);
  return window;
}

/** 读取当前显示器工作区，并将 bounds 限制在可见的 logical pixel 范围。 */
function getSafeBounds(
  mode: DesktopViewMode,
  requested?: WindowStateConfig,
): WindowStateConfig {
  const fallback = DEFAULT_WINDOW_CONFIGS[mode];
  const candidate = requested ?? fallback;
  const display = screen.getDisplayMatching({
    x: Number.isFinite(candidate.x) ? (candidate.x as number) : 0,
    y: Number.isFinite(candidate.y) ? (candidate.y as number) : 0,
    width: candidate.width,
    height: candidate.height,
  });
  const area = display.workArea;
  const width = Math.round(
    Math.min(Math.max(1, candidate.width), Math.max(1, area.width - 48)),
  );
  const height = Math.round(
    Math.min(Math.max(1, candidate.height), Math.max(1, area.height - 48)),
  );
  const x = Number.isFinite(candidate.x)
    ? Math.round(
        Math.min(
          area.x + area.width - width - 24,
          Math.max(area.x + 24, candidate.x as number),
        ),
      )
    : Math.round(area.x + (area.width - width) / 2);
  const y = Number.isFinite(candidate.y)
    ? Math.round(
        Math.min(
          area.y + area.height - height - 24,
          Math.max(area.y + 24, candidate.y as number),
        ),
      )
    : Math.round(area.y + (area.height - height) / 2);
  return { width, height, x, y };
}

/** 将紧凑模式限制为既定可交互尺寸范围。 */
function normalizeBounds(
  mode: DesktopViewMode,
  requested?: WindowStateConfig,
): WindowStateConfig {
  const bounds = getSafeBounds(mode, requested);
  if (mode === 'mini-today')
    return {
      ...bounds,
      width: Math.min(560, Math.max(340, bounds.width)),
      height: Math.min(820, Math.max(420, bounds.height)),
    };
  if (mode === 'workstation')
    return {
      ...bounds,
      width: Math.min(360, Math.max(260, bounds.width)),
      height: Math.min(640, Math.max(220, bounds.height)),
    };
  return {
    ...bounds,
    width: Math.max(800, bounds.width),
    height: Math.max(560, bounds.height),
  };
}

/** 仅接受窄 contract 的 JSON-compatible hydration payload。 */
function parseHydrationPayload(value: unknown): DesktopHydrationPayload | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<DesktopHydrationPayload>;
  if (!Number.isSafeInteger(candidate.requestId) || (candidate.requestId ?? 0) < 1)
    return undefined;
  if (!['full', 'mini-today', 'workstation'].includes(candidate.mode ?? ''))
    return undefined;
  if (!['expanded', 'edge-collapsed'].includes(candidate.presentation ?? ''))
    return undefined;
  if (!['mini-today', 'workstation'].includes(candidate.lastCompactMode ?? ''))
    return undefined;
  if (!candidate.windowStates || typeof candidate.windowStates !== 'object')
    return undefined;
  return candidate as DesktopHydrationPayload;
}

/** 返回 sender 所属的已知窗口角色，并同时校验其当前受信任 URL。 */
function isTrustedSender(event: IpcMainInvokeEvent, role: WindowRole): boolean {
  const window = BrowserWindow.fromWebContents(event.sender);
  const expectedWindow = role === 'main' ? mainWindow : edgeWindow;
  const senderFrame = event.senderFrame;
  return (
    window === expectedWindow &&
    senderFrame !== null &&
    isTrustedRendererUrl(senderFrame.url)
  );
}

/** 配置真实 Main 的 bounds、原生 frame 与紧凑模式行为，但不显示它。 */
function applyMainNativeState(
  mode: DesktopViewMode,
  geometry: WindowStateConfig,
): void {
  if (!mainWindow || mainWindow.isDestroyed())
    throw new Error('Main window is unavailable');
  mainWindow.setAlwaysOnTop(mode !== 'full');
  mainWindow.setResizable(mode === 'full');
  mainWindow.setMaximizable(mode === 'full');
  mainWindow.setMinimumSize(
    mode === 'full' ? 800 : geometry.width,
    mode === 'full' ? 560 : geometry.height,
  );
  suppressGeometryUntil = Date.now() + 320;
  mainWindow.setBounds(geometry);
}

/** 将真实用户移动或缩放后的 canonical bounds 防抖回传给 Main Renderer。 */
function publishUserGeometry(): void {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !mainWindow.isVisible() ||
    latestState.presentation === 'edge-collapsed' ||
    Date.now() < suppressGeometryUntil
  ) {
    return;
  }
  if (userGeometryTimer) clearTimeout(userGeometryTimer);
  userGeometryTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || Date.now() < suppressGeometryUntil)
      return;
    const bounds = mainWindow.getBounds();
    nativeRevision += 1;
    mainWindow.webContents.send('desktop:geometry-changed', {
      geometry: {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
      },
      mode: latestState.mode,
      origin: 'user',
      nativeRevision,
    });
  }, 180);
}

/** 安全显示 Main，然后才隐藏 Edge，保持至少一个可见 surface 的切换不变量。 */
function revealMain(): void {
  if (!mainWindow || mainWindow.isDestroyed())
    throw new Error('Main window is unavailable');
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (edgeWindow && !edgeWindow.isDestroyed()) edgeWindow.hide();
}

/** 加载并 reveal 固定尺寸 Edge；失败由调用方回退 Main。 */
async function revealEdge(): Promise<void> {
  if (!edgeWindow || edgeWindow.isDestroyed()) {
    edgeWindow = createWindow('edge-tab', {
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: false,
      width: EDGE_TAB_SIZE.width,
      height: EDGE_TAB_SIZE.height,
    });
    await edgeWindow.loadURL(getRendererUrl('edge-tab'));
  }
  const area = screen.getPrimaryDisplay().workArea;
  edgeWindow.setBounds({
    x: area.x + area.width - EDGE_TAB_SIZE.width,
    y: Math.round(area.y + Math.max(32, (area.height - EDGE_TAB_SIZE.height) / 2)),
    width: EDGE_TAB_SIZE.width,
    height: EDGE_TAB_SIZE.height,
  });
  edgeWindow.show();
  edgeWindow.focus();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
}

/** 等待 Main renderer ready-to-show；watchdog 可在此之前强制安全显示。 */
function waitForMainReadyToShow(): Promise<void> {
  if (mainReadyToShow) return Promise.resolve();
  return new Promise((resolveReady) => mainWindow?.once('ready-to-show', resolveReady));
}

/** 应用经校验的 Renderer 期望状态，并返回 Main 最终裁决的 canonical native state。 */
async function applyDesktopState(
  payload: DesktopHydrationPayload,
  fallbackReason?: string,
): Promise<NativeApplyResult> {
  const mode =
    payload.presentation === 'edge-collapsed' && payload.mode === 'full'
      ? payload.lastCompactMode
      : payload.mode;
  const geometry = normalizeBounds(mode, payload.windowStates[mode]);
  const wantsEdge = payload.presentation === 'edge-collapsed' && mode !== 'full';
  latestState = { ...payload, mode };
  applyMainNativeState(mode, geometry);
  if (wantsEdge) {
    try {
      await revealEdge();
      return {
        requestId: payload.requestId,
        mode,
        presentation: 'edge-collapsed',
        geometry,
        visibleSurface: 'edge',
        fallback: Boolean(fallbackReason),
        reason: fallbackReason,
      };
    } catch {
      await waitForMainReadyToShow();
      revealMain();
      return {
        requestId: payload.requestId,
        mode,
        presentation: 'expanded',
        geometry,
        visibleSurface: 'main',
        fallback: true,
        reason: 'edge-startup-failed',
      };
    }
  }
  await waitForMainReadyToShow();
  revealMain();
  return {
    requestId: payload.requestId,
    mode,
    presentation: 'expanded',
    geometry,
    visibleSurface: 'main',
    fallback: Boolean(fallbackReason),
    reason: fallbackReason,
  };
}

/** 在无效 payload 或 handshake 超时后安全显示 Full，杜绝隐身后台进程。 */
async function revealSafeFull(
  reason: string,
  requestId = latestRequestId + 1,
): Promise<NativeApplyResult> {
  const payload: DesktopHydrationPayload = {
    requestId,
    mode: 'full',
    presentation: 'expanded',
    lastCompactMode: 'mini-today',
    windowStates: {},
  };
  latestRequestId = Math.max(latestRequestId, requestId);
  return applyDesktopState(payload, reason);
}

/** 注册 URL、窗口角色、payload schema 与 revision 四重校验的 IPC handlers。 */
function registerDesktopIpc(): void {
  ipcMain.handle('desktop:hydrate', async (event, payload: unknown) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop hydrate sender');
    const state = parseHydrationPayload(payload);
    if (!state) return revealSafeFull('invalid-hydration-payload');
    if (state.requestId < latestRequestId)
      return {
        requestId: state.requestId,
        mode: latestState.mode,
        presentation: latestState.presentation,
        geometry: normalizeBounds(
          latestState.mode,
          latestState.windowStates[latestState.mode],
        ),
        visibleSurface: edgeWindow?.isVisible() ? 'edge' : 'main',
        fallback: true,
        reason: 'stale-request',
      } satisfies NativeApplyResult;
    latestRequestId = state.requestId;
    if (startupWatchdog) clearTimeout(startupWatchdog);
    return applyDesktopState(state);
  });
  ipcMain.handle('desktop:transition', async (event, payload: unknown) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop transition sender');
    const state = parseHydrationPayload(payload);
    if (!state || state.requestId < latestRequestId)
      throw new Error('Rejected desktop transition');
    latestRequestId = state.requestId;
    return applyDesktopState(state);
  });
  ipcMain.handle('desktop:bring-to-front', async (event) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop focus sender');
    return applyDesktopState({
      ...latestState,
      requestId: ++latestRequestId,
      presentation: 'expanded',
    });
  });
  ipcMain.handle('desktop:restore-main', async (event) => {
    if (!isTrustedSender(event, 'edge-tab'))
      throw new Error('Rejected edge restore sender');
    return applyDesktopState({
      ...latestState,
      requestId: ++latestRequestId,
      mode: latestState.lastCompactMode,
      presentation: 'expanded',
    });
  });
}

/** 创建初始隐藏 Main，并注册 handshake 前必要的 renderer 故障与 closed 保护。 */
async function createMainWindow(): Promise<void> {
  const window = createWindow('main', {
    frame: true,
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 560,
  });
  mainWindow = window;
  window.once('ready-to-show', () => {
    mainReadyToShow = true;
  });
  window.webContents.on('render-process-gone', () => {
    if (!window.isDestroyed() && !window.isVisible())
      void revealSafeFull('main-renderer-crashed').catch(exitAfterStartupFailure);
  });
  window.on('move', publishUserGeometry);
  window.on('resize', publishUserGeometry);
  window.on('closed', () => {
    mainWindow = undefined;
  });
  await window.loadURL(getRendererUrl('main'));
}

/** 显示启动错误并退出，避免保留没有可见窗口的 Electron 后台进程。 */
function exitAfterStartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox('Threadline desktop startup failed', message);
  app.exit(1);
}

app.whenReady().then(async () => {
  try {
    registerRendererProtocol();
    registerDesktopIpc();
    await createMainWindow();
    startupWatchdog = setTimeout(
      () =>
        void revealSafeFull('startup-handshake-timeout').catch(exitAfterStartupFailure),
      STARTUP_TIMEOUT_MS,
    );
  } catch (error) {
    exitAfterStartupFailure(error);
  }
});

app.on('window-all-closed', () => app.quit());
