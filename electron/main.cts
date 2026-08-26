/**
 * @fileoverview Electron Main 进程骨架：安全加载静态 Renderer 并创建初始隐藏的主窗口。
 */

import { app, BrowserWindow, dialog, net, protocol } from 'electron';
import { existsSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_PROTOCOL = 'threadline';
const APP_HOST = 'app';
const DEFAULT_RENDERER_URL = 'http://127.0.0.1:3118';
let mainWindow: BrowserWindow | undefined;

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

/** 阻止 Renderer 打开未审核的新窗口或离开桌面壳允许的页面来源。 */
function protectRendererNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    const allowedUrl = app.isPackaged
      ? `${APP_PROTOCOL}://${APP_HOST}/`
      : getDevelopmentRendererUrl();
    if (!url.startsWith(allowedUrl)) event.preventDefault();
  });
}

/** 读取开发时唯一允许加载的本地 Next URL。 */
function getDevelopmentRendererUrl(): string {
  return process.env.THREADLINE_ELECTRON_RENDERER_URL ?? DEFAULT_RENDERER_URL;
}

/** 创建初始隐藏 Main 窗口；Phase 3 的 hydration handshake 将决定首次 reveal 时机。 */
async function createMainWindow(): Promise<void> {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 560,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  protectRendererNavigation(window);
  await window.loadURL(
    app.isPackaged ? `${APP_PROTOCOL}://${APP_HOST}/` : getDevelopmentRendererUrl(),
  );
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
    await createMainWindow();
  } catch (error) {
    exitAfterStartupFailure(error);
  }
});

app.on('window-all-closed', () => app.quit());
