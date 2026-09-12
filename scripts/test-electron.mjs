/**
 * @fileoverview 通过 Playwright Electron 执行桌面壳的窗口切换冒烟验证，并保证测试进程可确定退出。
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

import { terminateOwnedProcess } from './desktop-build-runtime.mjs';
import { testElectronInteractionFeedback } from './test-electron-interaction-feedback.mjs';

const rendererPort = process.env.THREADLINE_ELECTRON_E2E_PORT ?? '3123';
const rendererUrl = `http://127.0.0.1:${rendererPort}`;
const userDataDirectory = await mkdtemp(join(tmpdir(), 'threadline-electron-e2e-'));

/** 返回所有原生窗口的可见性、逻辑 bounds 与加载 URL，供壳层不变量断言。 */
async function inspectWindows(app) {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      visible: window.isVisible(),
      url: window.webContents.getURL(),
      bounds: window.getBounds(),
    })),
  );
}

/** 将 Playwright 异步断言轮询到 deadline，避免任意 sleep。 */
async function waitFor(predicate, description, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${description}`);
}

/**
 * 等待单实例探针自行退出；超时后仅结束该探针拥有的进程树，并保留测试失败。
 */
function waitForProcessExit(child, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      void terminateOwnedProcess(child).finally(() =>
        reject(new Error('Timed out: second Electron instance must exit')),
      );
    }, timeoutMs);
    child.once('error', (error) => {
      if (timedOut) return;
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      if (timedOut) return;
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

/** 启动开发壳第二实例，验证单实例与紧凑窗口恢复行为。 */
function startSecondInstance() {
  return spawn(
    process.execPath,
    [
      'node_modules/electron/cli.js',
      '.',
      `--user-data-dir=${userDataDirectory}`,
      '--no-sandbox',
    ],
    {
      env: { ...process.env, THREADLINE_ELECTRON_RENDERER_URL: rendererUrl },
      stdio: 'ignore',
    },
  );
}

/** 启动官方 Next production server，确保 Web Proxy 与 nonce CSP 真实执行。 */
async function startRendererServer() {
  const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--port', rendererPort],
    { stdio: 'inherit' },
  );
  await waitFor(async () => {
    try {
      return (await fetch(rendererUrl)).ok;
    } catch {
      return false;
    }
  }, 'fresh Electron renderer server');
  return server;
}

let application;
let server;
let desktopProcess;
let exitCode = 0;
try {
  server = await startRendererServer();
  application = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDirectory}`, '--no-sandbox'],
    env: {
      ...process.env,
      THREADLINE_ELECTRON_RENDERER_URL: rendererUrl,
    },
  });
  desktopProcess = application.process();
  const page = await application.firstWindow();
  await page.waitForFunction(() => window.threadlineDesktop?.role === 'main');
  assert.equal(
    await page.evaluate(() => typeof window.threadlineDesktop?.openMailto),
    'function',
    'Main Renderer must only receive the narrow mailto bridge capability',
  );
  await assert.rejects(
    page.evaluate(() => window.threadlineDesktop?.openMailto('https://example.com')),
    /Rejected desktop mailto URL/,
    'Main must reject non-mailto URLs instead of relaxing renderer navigation',
  );
  assert.equal(
    await application.evaluate(({ Menu }) => Menu.getApplicationMenu()),
    null,
    'Windows menu bar must be disabled before any compact surface is shown',
  );
  const secondInstance = startSecondInstance();
  assert.equal(await waitForProcessExit(secondInstance), 0);
  assert.equal(
    (await inspectWindows(application)).filter((window) => window.visible).length,
    1,
  );
  assert.equal(
    await page
      .locator('.full-window-chrome')
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('-webkit-app-region'),
      ),
    'drag',
    'frameless Full chrome must provide a continuous drag region',
  );
  await page.getByRole('button', { name: '最小化窗口' }).click();
  await waitFor(
    async () =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((window) => window.isMinimized()),
      ),
    'Full window must minimize through the restricted Renderer action',
  );
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => !window.isDestroyed())
      ?.restore();
  });
  await page.waitForFunction(() => document.visibilityState === 'visible');
  const normalBounds = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => !window.isDestroyed())
      ?.getBounds(),
  );
  await page.getByRole('button', { name: '最大化窗口' }).click();
  await waitFor(
    async () =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((window) => window.isMaximized()),
      ),
    'Full window must maximize through the restricted Renderer action',
  );
  await page.getByRole('button', { name: '还原窗口' }).click();
  await waitFor(
    async () =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isMaximized()),
      ),
    'Full window must restore through the restricted Renderer action',
  );
  assert.deepEqual(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !window.isDestroyed())
        ?.getBounds(),
    ),
    normalBounds,
    'maximize and restore must retain the normal window geometry',
  );
  await testElectronInteractionFeedback(application, page);
  await page.getByRole('button', { name: '工作站', exact: true }).click();
  await page.getByTestId('workstation-panel').waitFor();
  assert.equal(
    await page
      .locator('.compact-window-header')
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('-webkit-app-region'),
      ),
    'drag',
    'frameless compact header must provide a drag region',
  );
  const compactMain = (await inspectWindows(application)).find(
    (window) => window.visible && window.url.includes('threadline-role=main'),
  );
  assert.ok(compactMain, 'Workstation mode must keep the Main BrowserWindow visible');
  assert.equal(compactMain.bounds.width, 200);
  assert.ok(
    compactMain.bounds.height >= 96 && compactMain.bounds.height <= 220,
    'Workstation height must use the target range or a work-area-clamped value',
  );
  // 奇数屏幕坐标在 250% 下产生分数物理像素，是旧外框回填增宽的触发条件。
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('role=main'))
      .setBounds({ x: 601, y: 101, width: 280 });
  });
  for (let index = 0; index < 100; index++) {
    await page.evaluate(
      (height) => window.threadlineDesktop.resizeCompactContent('workstation', height),
      120 + (index % 2),
    );
    assert.equal(
      await application.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().includes('role=main'))
            .getContentSize()[0],
      ),
      280,
      'content height updates preserve user width at fractional physical coordinates',
    );
  }
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('role=main'))
      .setBounds({ x: 600, y: 100, width: 200 });
  });
  await page.getByRole('button', { name: '收起', exact: true }).click();
  await waitFor(
    async () =>
      (await inspectWindows(application)).some(
        (window) => window.visible && window.url.includes('threadline-role=edge-tab'),
      ),
    'Edge must be the visible native surface after collapse',
  );
  assert.ok(
    (await inspectWindows(application)).some(
      (window) => window.visible && window.url.includes('threadline-role=edge-tab'),
    ),
  );
  const edgePage = application
    .windows()
    .find((window) => window.url().includes('threadline-role=edge-tab'));
  assert.ok(edgePage, 'Edge renderer page must be attached to Playwright');
  await edgePage.getByRole('button').hover();
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.ok(
    (await inspectWindows(application)).some(
      (item) => item.visible && item.url.includes('edge-tab'),
    ),
    'Hover must never expand Edge',
  );
  assert.ok(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes('edge-tab'))
        .isAlwaysOnTop(),
    ),
    'Edge must stay above ordinary windows',
  );

  // 测试控制 screen 输入以覆盖跨屏坐标规则，窗口移动和吸附仍使用真实 BrowserWindow。
  const edgeBounds = await application.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.webContents.getURL().includes('edge-tab'),
    );
    globalThis.compactOriginalCursor = screen.getCursorScreenPoint;
    const bounds = window.getBounds();
    globalThis.compactTestCursor = { x: bounds.x + 10, y: bounds.y + 10 };
    screen.getCursorScreenPoint = () => globalThis.compactTestCursor;
    return bounds;
  });
  await edgePage.mouse.move(10, 10);
  await edgePage.mouse.down();
  // 连续真实 Renderer 指针事件经过 trusted IPC，原生尺寸不能随每次定位递增。
  for (let index = 0; index < 120; index++) {
    await application.evaluate(({ screen }, index) => {
      const area = screen.getPrimaryDisplay().workArea;
      globalThis.compactTestCursor = {
        x: area.x + 4 + (index % 2),
        y: area.y + 84 + (index % 20),
      };
    }, index);
    await edgePage.mouse.move(12 + (index % 2), 20 + (index % 20));
    const bounds = (await inspectWindows(application)).find((w) =>
      w.url.includes('edge-tab'),
    ).bounds;
    assert.ok(
      Math.abs(bounds.width - edgeBounds.width) <= 1,
      'held drag must not grow native width',
    );
    assert.ok(
      Math.abs(bounds.height - edgeBounds.height) <= 1,
      'held drag must not grow native height',
    );
  }
  await edgePage.mouse.up();
  await waitFor(
    async () =>
      application.evaluate(({ BrowserWindow, screen }) => {
        const edge = BrowserWindow.getAllWindows().find((item) =>
          item.webContents.getURL().includes('edge-tab'),
        );
        return (
          edge?.isVisible() &&
          edge.getBounds().x === screen.getPrimaryDisplay().workArea.x
        );
      }),
    'drag must snap Edge left without restoring Main',
  );
  const movedEdge = (await inspectWindows(application)).find(
    (item) => item.visible && item.url.includes('edge-tab'),
  );
  assert.notEqual(
    movedEdge.bounds.y,
    edgeBounds.y,
    'Edge must retain the vertical drag',
  );
  await application.evaluate(({ screen }) => {
    screen.getCursorScreenPoint = globalThis.compactOriginalCursor;
  });
  // 用键盘激活复核无指针环境；下面仍通过真实按钮 click 验证鼠标恢复。
  await edgePage.getByRole('button', { name: '展开工作站' }).click();
  await page.getByTestId('workstation-panel').waitFor();
  await waitFor(
    async () =>
      (await inspectWindows(application)).filter((window) => window.visible).length ===
        1 &&
      (await inspectWindows(application)).some(
        (window) => window.visible && window.url.includes('threadline-role=main'),
      ),
    'Edge restore must reveal synchronized Main',
  );
  await page.getByRole('button', { name: '打开完整工作台' }).click();
  await page.locator('.full-window-chrome').waitFor();
  await page.getByRole('button', { name: '工作站', exact: true }).click();
  await page.getByTestId('workstation-panel').waitFor();
  await page.getByRole('button', { name: '收起', exact: true }).click();
  await waitFor(
    async () =>
      (await inspectWindows(application)).some(
        (window) => window.visible && window.url.includes('threadline-role=edge-tab'),
      ),
    'Edge must be visible before second-instance restore',
  );
  const edgeSecondInstance = startSecondInstance();
  assert.equal(await waitForProcessExit(edgeSecondInstance), 0);
  await page.getByTestId('workstation-panel').waitFor();
  await waitFor(
    async () =>
      (await inspectWindows(application)).filter((window) => window.visible).length ===
        1 &&
      (await inspectWindows(application)).some(
        (window) => window.visible && window.url.includes('threadline-role=main'),
      ),
    'second instance must restore the latest compact Main from Edge',
  );
  // 同次运行允许调宽；重启读取旧宽度时回到窄初始尺寸。
  await application.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('threadline-role=main'),
    );
    main.setBounds({ width: 280 });
  });
  await waitFor(
    async () =>
      (await inspectWindows(application)).some(
        (window) => window.visible && window.bounds.width === 280,
      ),
    'workstation remains manually resizable',
  );
  await page.evaluate(() => {
    const states = JSON.parse(
      localStorage.getItem('threadline.desktop-window-states.v3') ?? '{}',
    );
    states.workstation = { ...states.workstation, width: 340 };
    localStorage.setItem('threadline.desktop-window-states.v3', JSON.stringify(states));
  });
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await waitFor(
    async () => desktopProcess.exitCode !== null,
    'Full close must terminate the Electron process without rebuilding Main',
  );
  application = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDirectory}`, '--no-sandbox'],
    env: { ...process.env, THREADLINE_ELECTRON_RENDERER_URL: rendererUrl },
  });
  desktopProcess = application.process();
  const restartedPage = await application.firstWindow();
  await restartedPage.getByTestId('workstation-panel').waitFor();
  await waitFor(
    async () =>
      (await inspectWindows(application)).some(
        (window) => window.visible && window.bounds.width === 200,
      ),
    'restart must use compact initial width despite old wide preferences',
  );
  await restartedPage.getByRole('button', { name: '收起', exact: true }).click();
  await waitFor(async () => {
    const edge = (await inspectWindows(application)).find(
      (item) => item.visible && item.url.includes('edge-tab'),
    );
    return (
      edge?.bounds.x === movedEdge.bounds.x && edge?.bounds.y === movedEdge.bounds.y
    );
  }, 'Edge side and vertical position must survive a process restart');
  console.log('Electron window smoke test passed, including persisted Edge position.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  await application?.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
  await Promise.race([
    application?.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  await terminateOwnedProcess(desktopProcess).catch(() => undefined);
  await terminateOwnedProcess(server).catch(() => undefined);
  await rm(userDataDirectory, { force: true, recursive: true }).catch(() => undefined);
}

process.exit(exitCode);
