/** @fileoverview 以隔离 profile 和真实 BrowserWindow 验证启动加载期及连续 DPI 变化后的窗口可见性。 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright';
import { terminateOwnedProcess } from './desktop-build-runtime.mjs';

const fixtureDirectory = await mkdtemp(join(tmpdir(), 'threadline-startup-display-'));
const bootstrap = join(fixtureDirectory, 'bootstrap.cjs');
const repository = process.cwd();
await writeFile(
  bootstrap,
  `const { app, dialog } = require('electron');
globalThis.startupErrors = [];
dialog.showErrorBox = (title, message) => globalThis.startupErrors.push({ title, message });
app.setAppPath(${JSON.stringify(repository)});
app.whenReady().then(() => {
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  globalThis.startupDisplay = {
    ...display,
    id: display.id + 1000,
    scaleFactor: 2.5,
    workArea: JSON.parse(process.env.THREADLINE_STARTUP_TEST_AREA),
  };
  screen.getAllDisplays = () => [globalThis.startupDisplay];
  screen.getDisplayMatching = () => globalThis.startupDisplay;
  screen.getDisplayNearestPoint = () => globalThis.startupDisplay;
});
require(${JSON.stringify(resolve('dist-electron/main.cjs'))});
`,
);

let allowResponse;
let pauseRenderer = false;
/** 只暂停主 HTML 请求；favicon 和其他资源不会覆盖唯一等待中的响应回调。 */
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (
    pauseRenderer &&
    url.pathname === '/' &&
    url.searchParams.get('threadline-role') === 'main'
  )
    await new Promise((resolveResponse) => {
      allowResponse = resolveResponse;
    });
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(
    '<!doctype html><title>Startup display fixture</title><p>Isolated renderer</p>',
  );
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));

/** 释放刻意阻塞的初始 HTML，之后的 favicon 等请求直接响应以免拖慢测试退出。 */
function resumeRenderer() {
  pauseRenderer = false;
  allowResponse?.();
  allowResponse = undefined;
}

/** 在只有测试进程的 Main 中切换逻辑工作区，不修改 Windows 显示设置或用户实际窗口。 */
async function changeWorkArea(application, area) {
  await application.evaluate(({ screen }, nextArea) => {
    globalThis.startupDisplay.workArea = nextArea;
    screen.emit('display-metrics-changed', {}, globalThis.startupDisplay, [
      'workArea',
      'scaleFactor',
    ]);
  }, area);
}

/** 从真正的原生内容尺寸读取右下边缘，避免外框物理像素取整造成虚假失败。 */
async function inspectGeometry(application) {
  return application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const { x, y } = window.getBounds();
    const [width, height] = window.getContentSize();
    return { x, y, width, height };
  });
}

/** 等待有界的原生状态收敛；失败保留真实 geometry 方便区分 policy 与执行约束问题。 */
async function assertFits(application, area, label) {
  const deadline = Date.now() + 2500;
  let geometry;
  while (Date.now() < deadline) {
    geometry = await inspectGeometry(application);
    if (
      geometry.x >= area.x &&
      geometry.y >= area.y &&
      geometry.x + geometry.width <= area.x + area.width + 1 &&
      geometry.y + geometry.height <= area.y + area.height + 1
    )
      return geometry;
    await new Promise((resolveTick) => setTimeout(resolveTick, 30));
  }
  assert.fail(`${label}: ${JSON.stringify({ geometry, area })}`);
}

/** 每个场景使用自己的无凭证 userData；测试结束只关闭由测试拥有的 Electron 进程。 */
async function withApplication(area, scenario) {
  const userData = await mkdtemp(join(fixtureDirectory, 'profile-'));
  let application;
  let ownedProcess;
  try {
    pauseRenderer = true;
    application = await electron.launch({
      args: [bootstrap, `--user-data-dir=${userData}`],
      env: {
        ...process.env,
        THREADLINE_STARTUP_TEST_AREA: JSON.stringify(area),
        THREADLINE_ELECTRON_RENDERER_URL: `http://127.0.0.1:${server.address().port}`,
      },
    });
    ownedProcess = application.process();
    const deadline = Date.now() + 5000;
    while (!allowResponse && Date.now() < deadline)
      await new Promise((resolveTick) => setTimeout(resolveTick, 20));
    assert.ok(
      allowResponse,
      `renderer request must be deliberately paused: ${JSON.stringify(
        await application.evaluate(({ app, BrowserWindow }) => ({
          packaged: app.isPackaged,
          path: app.getAppPath(),
          userData: app.getPath('userData'),
          windows: BrowserWindow.getAllWindows().map((window) => ({
            url: window.webContents.getURL(),
            bounds: window.getBounds(),
          })),
        })),
      )}`,
    );
    await scenario(application);
    assert.deepEqual(
      await application.evaluate(() => globalThis.startupErrors),
      [],
      'display fixture must not trigger a startup failure',
    );
  } finally {
    resumeRenderer();
    // 先让刻意暂停的 loadURL 完成，再退出；否则 ERR_FAILED 会进入主窗口恢复流程。
    await application
      ?.evaluate(async ({ BrowserWindow }) => {
        await Promise.all(
          BrowserWindow.getAllWindows().map((window) => {
            if (!window.webContents.isLoadingMainFrame()) return Promise.resolve();
            return new Promise((resolveLoaded) => {
              window.webContents.once('did-finish-load', resolveLoaded);
              window.webContents.once('did-fail-load', resolveLoaded);
            });
          }),
        );
      })
      .catch(() => undefined);
    await Promise.race([
      application?.close().catch(() => undefined),
      new Promise((resolveCleanup) => setTimeout(resolveCleanup, 3000)),
    ]);
    await terminateOwnedProcess(ownedProcess).catch(() => undefined);
  }
}

try {
  const smallArea = { x: 0, y: 0, width: 720, height: 480 };
  await withApplication(smallArea, async (application) => {
    await assertFits(
      application,
      smallArea,
      'initial minimum must fit small DIP work area',
    );
  });

  const initialArea = { x: 0, y: 0, width: 1536, height: 920 };
  const startupArea = { x: 0, y: 0, width: 1152, height: 672 };
  await withApplication(initialArea, async (application) => {
    await changeWorkArea(application, startupArea);
    await assertFits(
      application,
      startupArea,
      'DPI changed while renderer was still loading',
    );
    resumeRenderer();
    const page = await application.firstWindow();
    await page.waitForFunction(() => Boolean(window.threadlineDesktop));
    await page.evaluate(() => {
      globalThis.startupEvents = [];
      window.threadlineDesktop.onNativeStateChanged((event) => {
        globalThis.startupEvents.push(event);
        setTimeout(() => {
          void window.threadlineDesktop.acknowledgeNativeState(event.stateRevision);
        }, 350);
      });
    });
    await page.evaluate(() => window.threadlineDesktop.showEntryWindow());
    const hydrated = await page.evaluate(() =>
      window.threadlineDesktop.hydrateDesktopState({
        requestId: 1,
        mode: 'full',
        presentation: 'expanded',
        windowStates: {},
      }),
    );
    const hydratedGeometry = await inspectGeometry(application);
    assert.deepEqual(
      hydrated.geometry,
      hydratedGeometry,
      'hydrate result must use final native bounds',
    );
    await new Promise((resolveSettle) => setTimeout(resolveSettle, 450));
    const firstChange = { x: 0, y: 0, width: 1000, height: 620 };
    const latestChange = { x: 0, y: 0, width: 900, height: 580 };
    await changeWorkArea(application, firstChange);
    await changeWorkArea(application, latestChange);
    await assertFits(
      application,
      latestChange,
      'later metrics must survive an outstanding renderer ACK',
    );
    const lateArea = { x: 0, y: 0, width: 800, height: 520 };
    // 不触发 screen 事件，覆盖 Electron 尚未发布 DPI 通知时二次激活的最后一次安全夹取。
    await application.evaluate(({ app, BrowserWindow }, area) => {
      globalThis.startupDisplay.workArea = area;
      BrowserWindow.getAllWindows()[0].setBounds({
        x: 100,
        y: 60,
        width: 900,
        height: 580,
      });
      app.emit('second-instance');
    }, lateArea);
    await assertFits(
      application,
      lateArea,
      'second instance must recheck the current work area',
    );
    await page.waitForFunction(() =>
      globalThis.startupEvents.some(
        (event) => event.reason === 'before-reveal-display-fit',
      ),
    );
    const correction = await page.evaluate(() =>
      globalThis.startupEvents.findLast(
        (event) => event.reason === 'before-reveal-display-fit',
      ),
    );
    const correctedGeometry = await inspectGeometry(application);
    assert.deepEqual(
      correction.geometry,
      correctedGeometry,
      'late reveal correction must synchronize Renderer canonical bounds',
    );
  });
  console.log(
    'PASS: small DIP startup, loading/queued display changes, final hydrate bounds and second-instance canonical correction fit real BrowserWindow bounds.',
  );
} finally {
  server.close();
}
