/**
 * @fileoverview Electron Main 进程：受限 Renderer 加载、启动 hydration handshake 与安全首次 reveal。
 */

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  screen,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import {
  getThemedWindowIcon,
  loadCompactPreferences,
  placeEdgeWindow,
  registerCompactControls,
} from './compact-controls.cjs';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_WINDOW_CONFIGS,
  COMPACT_WINDOW_BOUNDS,
  EDGE_TAB_SIZE,
  normalizeWindowStates,
  resolveSafeWindowState,
  type DesktopViewMode,
  type CompactPresentation,
  type LogicalWorkArea,
  type WindowStateConfig,
} from '../src/lib/desktop-window-policy.js';
import { readFramelessGeometry } from './window-geometry.cjs';

// Windows/Linux 默认菜单会占用紧凑窗口的标题区域，必须在 app ready 前移除。
Menu.setApplicationMenu(null);

const APP_PROTOCOL = 'threadline';
const APP_HOST = 'app';
const APP_USER_MODEL_ID = 'com.doris619619.threadline';
const PRODUCT_NAME = 'Threadline';
const DEFAULT_RENDERER_URL = 'http://127.0.0.1:3118';
const STARTUP_TIMEOUT_MS = 8_000;
const EDGE_REVEAL_TIMEOUT_MS = 8_000;
type WindowRole = 'main' | 'edge-tab';
type DesktopHydrationPayload = {
  requestId: number;
  mode: DesktopViewMode;
  presentation: CompactPresentation;
  windowStates: Partial<Record<DesktopViewMode, WindowStateConfig>>;
};
type CanonicalDesktopState = Omit<DesktopHydrationPayload, 'requestId'>;
type NativeApplyResult = {
  requestId: number;
  stateRevision: number;
  mode: DesktopViewMode;
  presentation: CompactPresentation;
  geometry: WindowStateConfig;
  visibleSurface: 'main' | 'edge';
  fallback: boolean;
  reason?: string;
};

let mainWindow: BrowserWindow | undefined;
let edgeWindow: BrowserWindow | undefined;
let mainReadyToShow = false;
let entryWindowShown = false;
let desktopStateInitialized = false;
let startupWatchdog: ReturnType<typeof setTimeout> | undefined;
let stateRevision = 0;
const stateAcknowledgements = new Map<number, () => void>();
let suppressGeometryUntil = 0;
let userGeometryTimer: ReturnType<typeof setTimeout> | undefined;
let intentionallyClosingEdge = false;
let rebuildingMain = false;
let reconcilingDisplays = false;
let isQuitting = false;
let latestState: CanonicalDesktopState = {
  mode: 'full',
  presentation: 'expanded',
  windowStates: {},
};
let rendererCspManifest: { routes?: Record<string, { header?: string }> } | undefined;

/** 返回开发与打包应用都可读取的统一 Threadline 窗口图标。 */
function getWindowIconPath(): string {
  return getThemedWindowIcon();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: { secure: true, standard: true, supportFetchAPI: true },
  },
]);

app.setAppUserModelId(APP_USER_MODEL_ID);
app.setName(PRODUCT_NAME);

const hasSingleInstanceLock = app.requestSingleInstanceLock();

/** 返回打包应用中静态 Next export 的绝对目录。 */
function getRendererDirectory(): string {
  return join(app.getAppPath(), '.next-electron');
}

/** 读取构建时扫描生成的 CSP manifest；缺失 manifest 视为打包错误而不是放宽策略。 */
function getRendererCspHeader(requestUrl: string): string {
  if (!rendererCspManifest) {
    rendererCspManifest = JSON.parse(
      readFileSync(join(getRendererDirectory(), 'threadline-csp.json'), 'utf8'),
    ) as { routes?: Record<string, { header?: string }> };
  }
  const pathname = new URL(requestUrl).pathname;
  const header =
    rendererCspManifest.routes?.[pathname]?.header ??
    rendererCspManifest.routes?.['/']?.header;
  if (!header) throw new Error(`Missing CSP policy for renderer route: ${pathname}`);
  return header;
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
    const response = await net.fetch(pathToFileURL(assetPath).toString());
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', getRendererCspHeader(request.url));
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
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

/** 只接受无 host 且带收件人的 mailto URL，拒绝 Renderer 借 IPC 打开任意外部地址。 */
function parseAllowedMailtoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'mailto:' && !parsed.host && parsed.pathname
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** 阻止 Renderer 打开未审核的新窗口或离开桌面壳允许的页面来源。 */
function protectRendererNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
}

/** 创建受保护 BrowserWindow；角色由受信任 Renderer URL 中的只读标记传递。 */
function createWindow(
  role: WindowRole,
  options: Electron.BrowserWindowConstructorOptions,
): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    icon: getWindowIconPath(),
    skipTaskbar: false,
    ...options,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  protectRendererNavigation(window);
  return window;
}

/** 将 Electron display 映射为 renderer policy 使用的统一 logical work area。 */
function getLogicalWorkAreas(): LogicalWorkArea[] {
  return screen.getAllDisplays().map((display) => display.workArea);
}

/** 复用唯一 geometry policy，保证 Main、Renderer、DPI 和屏幕移除后的裁决一致。 */
function resolveNativeBounds(
  mode: DesktopViewMode,
  requested?: WindowStateConfig,
): WindowStateConfig {
  const normalized =
    normalizeWindowStates({ [mode]: requested })[mode] ?? DEFAULT_WINDOW_CONFIGS[mode];
  const matchingDisplay = screen.getDisplayMatching({
    width: normalized.width,
    height: normalized.height,
    x: normalized.x ?? 0,
    y: normalized.y ?? 0,
  });
  return resolveSafeWindowState(
    mode,
    normalized,
    getLogicalWorkAreas(),
    matchingDisplay.workArea,
  );
}

/** 仅接受窄 contract 的 JSON-compatible hydration payload。 */
function parseHydrationPayload(value: unknown): DesktopHydrationPayload | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<DesktopHydrationPayload>;
  if (!Number.isSafeInteger(candidate.requestId) || (candidate.requestId ?? 0) < 1)
    return undefined;
  if (!['full', 'workstation'].includes(candidate.mode ?? '')) return undefined;
  if (!['expanded', 'edge-collapsed'].includes(candidate.presentation ?? ''))
    return undefined;
  if (!candidate.windowStates || typeof candidate.windowStates !== 'object')
    return undefined;
  const allowedKeys = new Set(['full', 'workstation']);
  for (const [mode, geometry] of Object.entries(candidate.windowStates)) {
    if (!allowedKeys.has(mode) || !isValidWindowState(geometry)) return undefined;
  }
  return candidate as DesktopHydrationPayload;
}

/** 拒绝非有限数、异常位置和不可见尺寸，避免嵌套 IPC geometry 绕过顶层校验。 */
function isValidWindowState(value: unknown): value is WindowStateConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const geometry = value as Record<string, unknown>;
  if (typeof geometry.width !== 'number' || typeof geometry.height !== 'number')
    return false;
  if (!Number.isFinite(geometry.width) || !Number.isFinite(geometry.height))
    return false;
  if (geometry.width < 1 || geometry.width > 10_000) return false;
  if (geometry.height < 1 || geometry.height > 10_000) return false;
  for (const axis of ['x', 'y'] as const) {
    if (geometry[axis] === undefined) continue;
    if (
      !Number.isFinite(geometry[axis]) ||
      Math.abs(geometry[axis] as number) > 100_000
    )
      return false;
  }
  return Object.keys(geometry).every((key) =>
    ['width', 'height', 'x', 'y'].includes(key),
  );
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
  if (mode !== 'full' && mainWindow.isMaximized()) mainWindow.unmaximize();
  // 在任何原生尺寸约束变更之前抑制中间 resize，避免把最大宽度误存为用户尺寸。
  suppressGeometryUntil = Date.now() + 320;
  if (userGeometryTimer) clearTimeout(userGeometryTimer);
  const compactLimits = mode === 'full' ? undefined : COMPACT_WINDOW_BOUNDS[mode];
  mainWindow.setAlwaysOnTop(mode !== 'full');
  mainWindow.setResizable(true);
  mainWindow.setMaximizable(mode === 'full');
  mainWindow.setMinimumSize(
    compactLimits?.minWidth ?? 800,
    compactLimits?.minHeight ?? 560,
  );
  mainWindow.setMaximumSize(
    compactLimits?.maxWidth ?? 0,
    compactLimits?.maxHeight ?? 0,
  );
  mainWindow.setBounds(geometry);
}

/** 将 BrowserWindow 的真实最大化状态回传给 Main Renderer，避免 Renderer 猜测窗口状态。 */
function publishMainWindowMaximizeState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('desktop:maximize-changed', {
    isMaximized: latestState.mode === 'full' && mainWindow.isMaximized(),
  });
}

/** 将真实用户移动或缩放后的 canonical bounds 防抖回传给 Main Renderer。 */
function publishUserGeometry(): void {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !mainWindow.isVisible() ||
    latestState.presentation === 'edge-collapsed' ||
    mainWindow.isMaximized() ||
    Date.now() < suppressGeometryUntil
  ) {
    return;
  }
  // Main 先同步保存最终尺寸；显示器事件不能等待 Renderer 的两轮防抖。
  latestState.windowStates[latestState.mode] = readFramelessGeometry(mainWindow);
  if (userGeometryTimer) clearTimeout(userGeometryTimer);
  userGeometryTimer = setTimeout(() => {
    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      !mainWindow.isVisible() ||
      latestState.presentation === 'edge-collapsed' ||
      mainWindow.isMaximized() ||
      Date.now() < suppressGeometryUntil
    )
      return;
    const bounds = readFramelessGeometry(mainWindow);
    stateRevision += 1;
    mainWindow.webContents.send('desktop:geometry-changed', {
      geometry: {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
      },
      mode: latestState.mode,
      origin: 'user',
      nativeRevision: stateRevision,
    });
  }, 180);
}

/** 安全显示 Main，然后释放无状态 Edge，保持至少一个可见 surface 的切换不变量。 */
function revealMain(): void {
  if (!mainWindow || mainWindow.isDestroyed())
    throw new Error('Main window is unavailable');
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (edgeWindow && !edgeWindow.isDestroyed()) {
    const currentEdge = edgeWindow;
    intentionallyClosingEdge = true;
    edgeWindow = undefined;
    currentEdge.destroy();
    intentionallyClosingEdge = false;
  }
}

/** 以 Main 为最终安全 surface；仅在 Main 可见后才销毁已故障的 Edge。 */
async function ensureVisibleSurface(reason: string): Promise<NativeApplyResult> {
  if (!mainWindow || mainWindow.isDestroyed()) await createMainWindow();
  const mode = 'workstation';
  const geometry = resolveNativeBounds(mode, latestState.windowStates[mode]);
  latestState = {
    ...latestState,
    mode,
    presentation: 'expanded',
  };
  stateRevision += 1;
  applyMainNativeState(mode, geometry);
  await waitForMainReadyToShow();
  try {
    await publishCanonicalState(geometry, 'main', 'recovery', reason);
  } catch {
    // Renderer 无响应时仍需显示 Main，确保至少一个 surface 可见。
  }
  revealMain();
  if (edgeWindow && !edgeWindow.isDestroyed()) {
    intentionallyClosingEdge = true;
    edgeWindow.destroy();
    intentionallyClosingEdge = false;
  }
  return {
    requestId: 0,
    stateRevision,
    mode,
    presentation: 'expanded',
    geometry,
    visibleSurface: 'main',
    fallback: true,
    reason,
  };
}

/** 将 Edge 的非主动关闭、渲染失败或显示器变化安全回退到可见 Main。 */
function recoverFromEdgeFailure(reason: string): void {
  if (isQuitting) return;
  void ensureVisibleSurface(reason).catch(exitAfterStartupFailure);
}

/** 激活已有实例的当前 surface；只有状态异常时才重建并显示 Main。 */
async function activateExistingInstance(): Promise<void> {
  if (edgeWindow && !edgeWindow.isDestroyed() && edgeWindow.isVisible()) {
    await applyDesktopState(
      {
        ...latestState,
        requestId: 0,
        mode: 'workstation' as const,
        presentation: 'expanded',
      },
      undefined,
      'second-instance',
    );
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    revealMain();
    return;
  }
  await ensureVisibleSurface('second-instance-main-unavailable');
}

/** Edge 可见时静默重建崩溃或关闭的 Main；否则恢复安全 Main 或退出。 */
function recoverFromMainFailure(reason: string): void {
  if (isQuitting) return;
  if (edgeWindow && !edgeWindow.isDestroyed() && edgeWindow.isVisible()) {
    if (rebuildingMain) return;
    rebuildingMain = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    mainWindow = undefined;
    mainReadyToShow = false;
    void createMainWindow()
      .catch(exitAfterStartupFailure)
      .finally(() => {
        rebuildingMain = false;
      });
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.reload();
    mainWindow.once('ready-to-show', () => {
      mainReadyToShow = true;
      void revealSafeFull(reason).catch(exitAfterStartupFailure);
    });
  } else {
    void ensureVisibleSurface(reason).catch(exitAfterStartupFailure);
  }
}

/** 加载并 reveal 固定尺寸 Edge；失败由调用方回退 Main。 */
async function revealEdge(): Promise<void> {
  if (!edgeWindow || edgeWindow.isDestroyed()) {
    edgeWindow = createWindow('edge-tab', {
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      minWidth: EDGE_TAB_SIZE.width,
      maxWidth: EDGE_TAB_SIZE.width,
      minHeight: EDGE_TAB_SIZE.height,
      maxHeight: EDGE_TAB_SIZE.height,
      width: EDGE_TAB_SIZE.width,
      height: EDGE_TAB_SIZE.height,
    });
    edgeWindow.webContents.on('did-fail-load', () =>
      recoverFromEdgeFailure('edge-load-failed'),
    );
    edgeWindow.webContents.on('render-process-gone', () =>
      recoverFromEdgeFailure('edge-renderer-crashed'),
    );
    edgeWindow.on('unresponsive', () => recoverFromEdgeFailure('edge-unresponsive'));
    edgeWindow.on('closed', () => {
      edgeWindow = undefined;
      if (
        !isQuitting &&
        !intentionallyClosingEdge &&
        (!mainWindow || !mainWindow.isVisible())
      ) {
        recoverFromEdgeFailure('edge-closed');
      }
    });
    const window = edgeWindow;
    const edgeReady = new Promise<void>((resolveReady, rejectReady) => {
      const timeout = setTimeout(
        () => rejectReady(new Error('Edge reveal timed out')),
        EDGE_REVEAL_TIMEOUT_MS,
      );
      window.once('ready-to-show', () => {
        clearTimeout(timeout);
        resolveReady();
      });
      window.once('closed', () => {
        clearTimeout(timeout);
        rejectReady(new Error('Edge closed before reveal'));
      });
    });
    await window.loadURL(getRendererUrl('edge-tab'));
    await edgeReady;
  }
  const mainBounds =
    mainWindow && !mainWindow.isDestroyed()
      ? readFramelessGeometry(mainWindow)
      : undefined;
  const matchingBounds =
    mainBounds ??
    resolveNativeBounds(latestState.mode, latestState.windowStates[latestState.mode]);
  placeEdgeWindow(
    edgeWindow,
    screen.getDisplayMatching({
      ...matchingBounds,
      x: matchingBounds.x ?? 0,
      y: matchingBounds.y ?? 0,
    }),
  );
  edgeWindow.showInactive();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
}

/** 在显示器增删、DPI 或 work area 变化后，对 Main 与 Edge 复用同一 geometry policy。 */
async function reconcileDisplayState(reason: string): Promise<void> {
  if (reconcilingDisplays || isQuitting) return;
  reconcilingDisplays = true;
  try {
    const mode = latestState.mode;
    const geometry = resolveNativeBounds(mode, latestState.windowStates[mode]);
    latestState = {
      ...latestState,
      windowStates: { ...latestState.windowStates, [mode]: geometry },
    };
    stateRevision += 1;
    const edgeVisible = Boolean(
      latestState.presentation === 'edge-collapsed' &&
      edgeWindow &&
      !edgeWindow.isDestroyed() &&
      edgeWindow.isVisible(),
    );
    if (edgeVisible) {
      // 收起时只移动入口；后台 Renderer 可能被节流，不以 ACK 超时强制展开。
      placeEdgeWindow(
        edgeWindow!,
        screen.getDisplayMatching({
          ...geometry,
          x: geometry.x ?? 0,
          y: geometry.y ?? 0,
        }),
      );
      mainWindow?.webContents.send('desktop:state-changed', {
        ...latestState,
        geometry,
        visibleSurface: 'edge',
        stateRevision,
        origin: 'recovery',
        reason,
      });
      return;
    }
    applyMainNativeState(mode, geometry);
    await waitForMainReadyToShow();
    try {
      await publishCanonicalState(geometry, 'main', 'recovery', reason);
    } catch {
      // 等待期间用户可能已经收起；旧的显示器同步不能覆盖这个新选择。
      if (
        latestState.presentation === 'edge-collapsed' &&
        edgeWindow &&
        !edgeWindow.isDestroyed() &&
        edgeWindow.isVisible()
      )
        return;
      await ensureVisibleSurface('display-state-sync-timeout');
    }
  } finally {
    reconcilingDisplays = false;
  }
}

/** 等待 Main renderer ready-to-show；watchdog 可在此之前强制安全显示。 */
function waitForMainReadyToShow(): Promise<void> {
  if (mainReadyToShow) return Promise.resolve();
  return new Promise((resolveReady) => mainWindow?.once('ready-to-show', resolveReady));
}

/** 广播 Main 裁决状态并等待 Renderer 完成同步；超时由调用方回退到安全 surface。 */
function publishCanonicalState(
  geometry: WindowStateConfig,
  visibleSurface: 'main' | 'edge',
  origin: 'renderer-command' | 'edge-restore' | 'second-instance' | 'recovery',
  reason?: string,
): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed())
    return Promise.reject(new Error('Main window is unavailable'));
  const revision = stateRevision;
  return new Promise((resolveAcknowledged, rejectAcknowledged) => {
    const timeout = setTimeout(() => {
      stateAcknowledgements.delete(revision);
      rejectAcknowledged(
        new Error(`Desktop state acknowledgement timed out: ${revision}`),
      );
    }, 1_500);
    stateAcknowledgements.set(revision, () => {
      clearTimeout(timeout);
      resolveAcknowledged();
    });
    mainWindow?.webContents.send('desktop:state-changed', {
      ...latestState,
      geometry,
      visibleSurface,
      stateRevision: revision,
      origin,
      reason,
    });
  });
}

/** 应用经校验的 Renderer 期望状态，并返回 Main 最终裁决的 canonical native state。 */
async function applyDesktopState(
  payload: DesktopHydrationPayload,
  fallbackReason?: string,
  origin:
    | 'renderer-command'
    | 'edge-restore'
    | 'second-instance'
    | 'recovery' = 'renderer-command',
): Promise<NativeApplyResult> {
  const mode =
    payload.presentation === 'edge-collapsed' && payload.mode === 'full'
      ? 'workstation'
      : payload.mode;
  const sourceGeometry =
    mode === latestState.mode && mainWindow && !mainWindow.isDestroyed()
      ? readFramelessGeometry(mainWindow)
      : payload.windowStates[mode];
  const geometry = resolveNativeBounds(
    mode,
    origin === 'renderer-command' && payload.presentation === 'edge-collapsed'
      ? sourceGeometry
      : payload.windowStates[mode],
  );
  const wantsEdge = payload.presentation === 'edge-collapsed' && mode !== 'full';
  latestState = {
    mode,
    presentation: payload.presentation,
    windowStates: { ...payload.windowStates, [mode]: geometry },
  };
  stateRevision += 1;
  applyMainNativeState(mode, geometry);
  if (wantsEdge) {
    try {
      await revealEdge();
      return {
        requestId: payload.requestId,
        stateRevision,
        mode,
        presentation: 'edge-collapsed',
        geometry,
        visibleSurface: 'edge',
        fallback: Boolean(fallbackReason),
        reason: fallbackReason,
      };
    } catch {
      return ensureVisibleSurface('edge-startup-failed');
    }
  }
  await waitForMainReadyToShow();
  if (origin !== 'renderer-command') {
    try {
      await publishCanonicalState(geometry, 'main', origin, fallbackReason);
    } catch {
      return ensureVisibleSurface('renderer-state-sync-timeout');
    }
  }
  revealMain();
  return {
    requestId: payload.requestId,
    stateRevision,
    mode,
    presentation: 'expanded',
    geometry,
    visibleSurface: 'main',
    fallback: Boolean(fallbackReason),
    reason: fallbackReason,
  };
}

/** 在无效 payload 或 handshake 超时后安全显示 Full，杜绝隐身后台进程。 */
async function revealSafeFull(reason: string): Promise<NativeApplyResult> {
  const payload: DesktopHydrationPayload = {
    requestId: 0,
    mode: 'full',
    presentation: 'expanded',
    windowStates: {},
  };
  return applyDesktopState(payload, reason, 'recovery');
}

/** 注册 URL、窗口角色、payload schema 与 revision 四重校验的 IPC handlers。 */
function registerDesktopIpc(): void {
  registerCompactControls({
    getMain: () => mainWindow,
    getEdge: () => edgeWindow,
    getMode: () => latestState.mode,
    isExpanded: () => latestState.presentation === 'expanded',
    isTrusted: isTrustedSender,
    onResize: (geometry) => {
      latestState.windowStates[latestState.mode] = geometry;
      stateRevision += 1;
      mainWindow?.webContents.send('desktop:geometry-changed', {
        geometry,
        mode: latestState.mode,
        origin: 'content',
        nativeRevision: stateRevision,
      });
    },
  });
  ipcMain.handle('desktop:hydrate', async (event, payload: unknown) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop hydrate sender');
    const state = parseHydrationPayload(payload);
    if (!state) return revealSafeFull('invalid-hydration-payload');
    desktopStateInitialized = true;
    if (startupWatchdog) clearTimeout(startupWatchdog);
    return applyDesktopState(state);
  });
  ipcMain.handle('desktop:transition', async (event, payload: unknown) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop transition sender');
    const state = parseHydrationPayload(payload);
    if (!state) throw new Error('Rejected desktop transition');
    desktopStateInitialized = true;
    if (startupWatchdog) clearTimeout(startupWatchdog);
    return applyDesktopState(state);
  });
  /** 启动和登录页不等待业务水合即可居中显示；每次进程启动只执行一次。 */
  ipcMain.handle('desktop:entry-window', (event) => {
    if (!isTrustedSender(event, 'main')) throw new Error('Rejected entry sender');
    // 启动层迟到的 effect 不能覆盖已经选择的工作站尺寸或收起状态。
    if (entryWindowShown || desktopStateInitialized || !mainWindow) return;
    entryWindowShown = true;
    if (startupWatchdog) clearTimeout(startupWatchdog);
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const bounds = resolveSafeWindowState(
      'full',
      DEFAULT_WINDOW_CONFIGS.full,
      getLogicalWorkAreas(),
      area,
    );
    applyMainNativeState('full', bounds);
    mainWindow.show();
  });
  ipcMain.handle('desktop:bring-to-front', async (event) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop focus sender');
    return applyDesktopState({
      ...latestState,
      requestId: 0,
      presentation: 'expanded',
    });
  });
  ipcMain.handle('desktop:restore-main', async (event) => {
    if (!isTrustedSender(event, 'edge-tab'))
      throw new Error('Rejected edge restore sender');
    // 展开位置跟随用户刚拖动的入口，避免回到另一侧或旧显示器。
    const compactMode = 'workstation' as const;
    const windowStates = { ...latestState.windowStates };
    if (edgeWindow) {
      const edge = edgeWindow.getBounds();
      const area = screen.getDisplayMatching(edge).workArea;
      const compact = resolveNativeBounds(compactMode, windowStates[compactMode]);
      const left = edge.x < area.x + area.width / 2;
      windowStates[compactMode] = {
        ...compact,
        x: left ? area.x : area.x + area.width - compact.width,
        y: Math.max(area.y, Math.min(edge.y, area.y + area.height - compact.height)),
      };
    }
    return applyDesktopState(
      {
        ...latestState,
        windowStates,
        requestId: 0,
        mode: compactMode,
        presentation: 'expanded',
      },
      undefined,
      'edge-restore',
    );
  });
  /** 仅让受信任 Main Renderer 通过系统邮件客户端打开经过协议校验的 mailto 链接。 */
  ipcMain.handle('desktop:open-mailto', async (event, value: unknown) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop mailto sender');
    const url = parseAllowedMailtoUrl(value);
    if (!url) throw new Error('Rejected desktop mailto URL');
    await shell.openExternal(url);
  });
  /** 仅允许受信任 Main Renderer 请求关闭自身，复用现有 close 生命周期。 */
  ipcMain.handle('desktop:close-main', async (event) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop close sender');
    // Edge 可能隐藏但仍存在；只 close Main 会让 window-all-closed 永远不触发并留下后台进程。
    isQuitting = true;
    app.quit();
  });
  /** 仅允许受信任 Main Renderer 最小化自身，避免开放任意 BrowserWindow 控制。 */
  ipcMain.handle('desktop:minimize-main', async (event) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop minimize sender');
    mainWindow?.minimize();
  });
  /** 只允许 Full 的 Main Renderer 读取真实 native maximize 状态。 */
  ipcMain.handle('desktop:get-maximized', async (event) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop maximize state sender');
    return latestState.mode === 'full' && Boolean(mainWindow?.isMaximized());
  });
  /** 只允许 Full 的 Main Renderer 切换真实 BrowserWindow maximize，紧凑模式不接受该能力。 */
  ipcMain.handle('desktop:toggle-maximized', async (event) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop maximize sender');
    if (!mainWindow || mainWindow.isDestroyed() || latestState.mode !== 'full')
      return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    publishMainWindowMaximizeState();
    return mainWindow.isMaximized();
  });
  /**
   * 仅让受信任 Main Renderer 把当前报告 DOM 输出为 PDF。
   * Renderer 不传文件路径或 HTML，避免向页面暴露通用文件写入与任意内容打印能力。
   */
  ipcMain.handle('desktop:export-report-pdf', async (event) => {
    if (!isTrustedSender(event, 'main'))
      throw new Error('Rejected desktop report export sender');
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error('Missing desktop report export window');
    const destination = await dialog.showSaveDialog(owner, {
      title: '导出 Threadline 洞察报告',
      defaultPath: 'Threadline-洞察报告.pdf',
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      properties: ['createDirectory'],
    });
    if (destination.canceled || !destination.filePath) return { canceled: true };
    const pdf = await event.sender.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.45, right: 0.45 },
    });
    await writeFile(destination.filePath, pdf);
    return { canceled: false, filePath: destination.filePath };
  });
  ipcMain.handle('desktop:state-applied', async (event, revision: unknown) => {
    if (
      !isTrustedSender(event, 'main') ||
      typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) ||
      revision < 1
    )
      throw new Error('Rejected desktop state acknowledgement');
    const acknowledge = stateAcknowledgements.get(revision);
    if (acknowledge) {
      stateAcknowledgements.delete(revision);
      acknowledge();
    }
  });
}

/** 创建初始隐藏 Main，并注册 handshake 前必要的 renderer 故障与 closed 保护。 */
async function createMainWindow(): Promise<void> {
  loadCompactPreferences();
  const initialBounds = resolveSafeWindowState(
    'full',
    DEFAULT_WINDOW_CONFIGS.full,
    getLogicalWorkAreas(),
    screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
  );
  const window = createWindow('main', {
    frame: false,
    minWidth: 800,
    minHeight: Math.min(560, initialBounds.height),
    ...initialBounds,
  });
  mainWindow = window;
  let userRequestedClose = false;
  window.once('ready-to-show', () => {
    mainReadyToShow = true;
  });
  window.webContents.on('render-process-gone', () => {
    if (!window.isDestroyed()) recoverFromMainFailure('main-renderer-crashed');
  });
  window.on('move', publishUserGeometry);
  window.on('resize', publishUserGeometry);
  window.on('maximize', publishMainWindowMaximizeState);
  window.on('unmaximize', publishMainWindowMaximizeState);
  window.on('close', () => {
    userRequestedClose = true;
    if (!rebuildingMain) isQuitting = true;
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
    mainReadyToShow = false;
    if (isQuitting || rebuildingMain) return;
    if (edgeWindow && !edgeWindow.isDestroyed() && edgeWindow.isVisible()) {
      recoverFromMainFailure('main-closed-while-edge-visible');
    } else if (userRequestedClose) {
      app.quit();
    } else {
      recoverFromMainFailure('main-closed-unexpectedly');
    }
  });
  await window.loadURL(getRendererUrl('main'));
}

/** 显示启动错误并退出，避免保留没有可见窗口的 Electron 后台进程。 */
function exitAfterStartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox('Threadline desktop startup failed', message);
  app.exit(1);
}

/** 仅在取得单实例锁后注册启动与生命周期监听器。 */
function bootstrapApplication(): void {
  app.whenReady().then(async () => {
    try {
      registerRendererProtocol();
      registerDesktopIpc();
      await createMainWindow();
      screen.on(
        'display-removed',
        () =>
          void reconcileDisplayState('display-removed').catch(exitAfterStartupFailure),
      );
      screen.on(
        'display-metrics-changed',
        () =>
          void reconcileDisplayState('display-metrics-changed').catch(
            exitAfterStartupFailure,
          ),
      );
      screen.on(
        'display-added',
        () =>
          void reconcileDisplayState('display-added').catch(exitAfterStartupFailure),
      );
      if (!entryWindowShown && !desktopStateInitialized)
        startupWatchdog = setTimeout(
          () =>
            void revealSafeFull('startup-handshake-timeout').catch(
              exitAfterStartupFailure,
            ),
          STARTUP_TIMEOUT_MS,
        );
    } catch (error) {
      exitAfterStartupFailure(error);
    }
  });

  app.on('second-instance', () => {
    void activateExistingInstance().catch(exitAfterStartupFailure);
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => app.exit(0));
}

if (hasSingleInstanceLock) {
  bootstrapApplication();
} else {
  app.quit();
}
