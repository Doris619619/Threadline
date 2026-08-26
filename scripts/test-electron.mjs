/**
 * @fileoverview 通过 Playwright Electron 执行桌面壳的窗口切换冒烟验证，并保证测试进程可确定退出。
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const rendererPort = process.env.THREADLINE_ELECTRON_E2E_PORT ?? '3123';
const rendererUrl = `http://127.0.0.1:${rendererPort}`;
const userDataDirectory = await mkdtemp(join(tmpdir(), 'threadline-electron-e2e-'));

/** 返回所有原生窗口的可见性与加载 URL，供可见 surface 不变量断言。 */
async function inspectWindows(app) {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      visible: window.isVisible(),
      url: window.webContents.getURL(),
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

/** 断言第二实例在单实例锁拒绝后自行退出，而不启动第二个 BrowserWindow。 */
function waitForProcessExit(process, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      process.kill();
      reject(new Error('Timed out: second Electron instance must exit'));
    }, timeoutMs);
    process.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    process.once('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

/** 启动独占的 Next production server，避免复用不兼容的开发服务。 */
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
let exitCode = 0;
try {
  server = await startRendererServer();
  application = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDirectory}`, '--no-sandbox'],
    env: { ...process.env, THREADLINE_ELECTRON_RENDERER_URL: rendererUrl },
  });
  const page = await application.firstWindow();
  await page.waitForFunction(() => window.threadlineDesktop?.role === 'main');
  const secondInstance = spawn(
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
  assert.equal(await waitForProcessExit(secondInstance), 0);
  assert.equal(
    (await inspectWindows(application)).filter((window) => window.visible).length,
    1,
  );
  await page.getByRole('button', { name: '迷你今日', exact: true }).click();
  await page.getByTestId('mini-today-panel').waitFor();
  await page.getByRole('button', { name: '工作站', exact: true }).click();
  await page.getByTestId('workstation-panel').waitFor();
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
  console.log('Electron window smoke test passed.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  await application?.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
  await Promise.race([
    application?.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  server?.kill();
  await rm(userDataDirectory, { force: true, recursive: true }).catch(() => undefined);
}

process.exit(exitCode);
