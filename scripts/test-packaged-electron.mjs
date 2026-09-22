/**
 * @fileoverview 通过 Chromium CDP 验证已生成 Windows EXE 的受限 protocol、CSP、preload 行为与退出。
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright';

import { terminateOwnedProcess } from './desktop-build-runtime.mjs';
import { verifyWindowsExecutableIcon } from './verify-windows-icon.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const defaultExecutable = join(
  repositoryRoot,
  'release',
  'win-unpacked',
  'Threadline.exe',
);
const launchTimeoutMs = 30_000;
const actionTimeoutMs = 10_000;

/** 解析调用者指定或 canonical package-dir 生成的 EXE，并拒绝目录或缺失产物。 */
async function resolvePackagedExecutable() {
  const executablePath = resolve(
    process.env.THREADLINE_PACKAGED_EXECUTABLE ?? defaultExecutable,
  );
  const details = await stat(executablePath);
  if (!details.isFile())
    throw new Error(`Packaged Electron executable is not a file: ${executablePath}`);
  return executablePath;
}

/** 让系统分配一个临时 loopback 端口；释放后立即交给本轮 EXE 的 Chromium 调试端点。 */
async function reserveLoopbackPort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string', 'Failed to reserve a CDP port.');
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
  return address.port;
}

/** 清除开发 Renderer 覆盖，保证 packaged smoke 只能加载 EXE 内的静态资源。 */
function packagedEnvironment() {
  const environment = { ...process.env };
  delete environment.THREADLINE_ELECTRON_RENDERER_URL;
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}

/** 收集并转发 EXE 诊断；失败信息保留尾部，成功日志仍可解释 CDP 启动阶段。 */
function captureProcessOutput(child) {
  const chunks = [];
  for (const [name, stream] of [
    ['stdout', child.stdout],
    ['stderr', child.stderr],
  ]) {
    stream?.on('data', (chunk) => {
      const text = chunk.toString();
      chunks.push(`[${name}] ${text}`);
      process.stdout.write(text);
    });
  }
  return () => chunks.join('').slice(-4_000);
}

/** 等待 packaged Chromium 的 CDP version endpoint；EXE 提前退出时返回保留的原生日志。 */
async function waitForCdp(child, port, readOutput) {
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + launchTimeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Packaged Electron exited before CDP became ready (${child.exitCode}).\n${readOutput()}`,
      );
    }
    try {
      if ((await fetch(`${endpoint}/json/version`)).ok) return endpoint;
    } catch {
      // Chromium 尚未监听时继续短轮询。
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(
    `Packaged Electron CDP did not become ready within ${launchTimeoutMs}ms.\n${readOutput()}`,
  );
}

/** 在 CDP context 中等待受限生产 protocol 的 Main 页面，忽略 Chromium 的临时空 target。 */
async function waitForMainPage(context) {
  const deadline = Date.now() + launchTimeoutMs;
  while (Date.now() < deadline) {
    const page = context
      .pages()
      .find((candidate) => candidate.url().startsWith('threadline://app/'));
    if (page) return page;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error('Packaged Electron did not expose a threadline:// Main page.');
}

/** 等待子进程确定退出；超时后只结束本 runner 创建的精确 Windows 进程树。 */
async function waitForProcessExit(child, description) {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolveExit, rejectExit) => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      void terminateOwnedProcess(child).finally(() =>
        rejectExit(new Error(`Timed out: ${description}`)),
      );
    }, actionTimeoutMs);
    child.once('error', (error) => {
      if (timedOut) return;
      clearTimeout(timeout);
      rejectExit(error);
    });
    child.once('exit', (code) => {
      if (timedOut) return;
      clearTimeout(timeout);
      resolveExit(code);
    });
  });
}

/**
 * 运行不依赖 Node inspector 的 packaged smoke。
 *
 * 正式 fuses 会关闭 Main 的 CLI inspect，因此这里只使用 Chromium CDP 观察 Renderer；
 * Main 原生 menu、bounds 与多窗口内部状态继续由开发壳的 `_electron` smoke 覆盖。
 */
async function runPackagedSmoke(executablePath) {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'threadline-packaged-e2e-'));
  const cdpPort = await reserveLoopbackPort();
  const environment = packagedEnvironment();
  const executable = spawn(
    executablePath,
    [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDirectory}`,
      '--no-sandbox',
    ],
    {
      cwd: repositoryRoot,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const readOutput = captureProcessOutput(executable);
  let browser;

  try {
    const endpoint = await waitForCdp(executable, cdpPort, readOutput);
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    assert.ok(context, 'Packaged Electron did not expose a Chromium context.');
    const page = await waitForMainPage(context);
    page.setDefaultTimeout(actionTimeoutMs);

    await page.waitForFunction(() => window.threadlineDesktop?.role === 'main');
    assert.match(
      page.url(),
      /^threadline:\/\/app\//,
      'packaged Main must load through the production threadline protocol',
    );
    assert.equal(
      context.pages().some((candidate) => /^(https?:|file:)/.test(candidate.url())),
      false,
      'packaged windows must not load a dev server or file URL',
    );
    const csp = await page.evaluate(async () => {
      const response = await fetch('threadline://app/');
      return response.headers.get('content-security-policy');
    });
    assert.match(csp ?? '', /default-src 'self'; script-src 'self'/);

    const secondInstance = spawn(
      executablePath,
      [`--user-data-dir=${userDataDirectory}`, '--no-sandbox'],
      {
        cwd: repositoryRoot,
        env: environment,
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    assert.equal(await waitForProcessExit(secondInstance, 'second instance exit'), 0);
    await page.locator('.full-window-chrome, .desktop-entry-chrome').first().waitFor();
    if (await page.locator('.desktop-entry-chrome').count()) {
      // 真实云预览在登录阶段也必须可关闭、居中；不为 smoke 登录或写入云数据。
      const geometry = await page.evaluate(() => ({
        x: window.screenX,
        y: window.screenY,
        width: window.outerWidth,
        height: window.outerHeight,
        area: {
          x: screen.availLeft,
          y: screen.availTop,
          width: screen.availWidth,
          height: screen.availHeight,
        },
      }));
      assert.ok(
        Math.abs(
          geometry.x + geometry.width / 2 - geometry.area.x - geometry.area.width / 2,
        ) < 4,
        `Entry window horizontally centered: ${JSON.stringify(geometry)}`,
      );
      assert.ok(
        Math.abs(
          geometry.y + geometry.height / 2 - geometry.area.y - geometry.area.height / 2,
        ) < 4,
        `Entry window vertically centered: ${JSON.stringify(geometry)}`,
      );
      await page
        .locator('.desktop-entry-chrome button[aria-label="关闭窗口"]')
        .first()
        .waitFor();
      await page.locator('.auth-gate').waitFor();
      if (process.env.THREADLINE_ENTRY_SCREENSHOT)
        await page.screenshot({ path: process.env.THREADLINE_ENTRY_SCREENSHOT });
    } else {
      // 只有隔离 local adapter 能进入此分支；验证新栏目动态 chunk 和真实静态协议持久化。
      await page
        .getByLabel('主导航', { exact: true })
        .getByRole('button', { name: '习惯', exact: true })
        .click();
      await page.getByRole('button', { name: '起床了', exact: true }).click();
      await page
        .getByTestId('habit-wake')
        .getByRole('button', { name: /编辑起床时间/ })
        .waitFor();
      const wakeTime = await page
        .getByTestId('habit-wake')
        .getByRole('button', { name: /编辑起床时间/ })
        .textContent();
      assert.match(wakeTime ?? '', /^\d{2}:\d{2}$/);
      await page
        .getByTestId('habit-wake')
        .getByRole('button', { name: /编辑起床时间/ })
        .click();
      await page.getByRole('dialog').getByLabel('起床时间', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.reload();
      await page.getByRole('heading', { name: '任务大厅', exact: true }).waitFor();
      await page
        .getByLabel('主导航', { exact: true })
        .getByRole('button', { name: '习惯', exact: true })
        .click();
      await page
        .getByTestId('habit-wake')
        .getByRole('button', { name: /编辑起床时间/ })
        .waitFor();
      assert.equal(
        await page
          .getByTestId('habit-wake')
          .getByRole('button', { name: /编辑起床时间/ })
          .textContent(),
        wakeTime,
      );
      await page.getByRole('button', { name: '工作站', exact: true }).click();
      await page.getByTestId('workstation-panel').waitFor();
      await page.getByRole('button', { name: '打开完整工作台' }).click();
      await page.locator('.full-window-chrome').waitFor();
    }
    await page.getByRole('button', { name: '关闭窗口' }).click();
    assert.equal(await waitForProcessExit(executable, 'packaged Main close'), 0);
  } finally {
    await browser?.close().catch(() => undefined);
    await terminateOwnedProcess(executable).catch(() => undefined);
    await rm(userDataDirectory, { force: true, recursive: true }).catch(
      () => undefined,
    );
  }
}

try {
  const executablePath = await resolvePackagedExecutable();
  console.log(
    verifyWindowsExecutableIcon(
      executablePath,
      join(
        repositoryRoot,
        'electron',
        'assets',
        process.env.THREADLINE_DESKTOP_THEME === 'anya' ? 'icon-anya.ico' : 'icon.ico',
      ),
    ),
  );
  await runPackagedSmoke(executablePath);
  console.log(`Packaged Electron smoke passed: ${executablePath}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
