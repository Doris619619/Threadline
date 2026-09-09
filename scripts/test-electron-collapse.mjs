/** @fileoverview 在真实静态 Electron 壳中验证尺寸记忆和收起不反弹；只使用隔离目录，不认证或写业务数据。 */
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const userData = await mkdtemp(join(tmpdir(), 'threadline-collapse-regression-'));
let application;
try {
  application = await electron.launch({
    timeout: 15000,
    args: ['.', `--user-data-dir=${userData}`, '--no-sandbox'],
    env: { ...process.env, THREADLINE_ELECTRON_RENDERER_URL: 'threadline://app/' },
  });
  const page = await application.firstWindow();
  await page.locator('.auth-gate').waitFor();
  // 以登录门禁替代业务层，只在可见时 ACK，复现后台 Renderer 暂停/节流。
  await page.evaluate(() =>
    window.threadlineDesktop.onNativeStateChanged((event) => {
      if (document.visibilityState === 'visible')
        void window.threadlineDesktop.acknowledgeNativeState(event.stateRevision);
    }),
  );
  await page.evaluate(() =>
    window.threadlineDesktop.transitionWindow({
      requestId: 1,
      mode: 'workstation',
      presentation: 'expanded',
      lastCompactMode: 'workstation',
      windowStates: { workstation: { width: 340, height: 130, x: 500, y: 100 } },
    }),
  );
  await page.waitForTimeout(400);
  await application.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('threadline-role=main'),
    );
    main.setBounds({ width: 200 });
    main.emit('resize');
  });
  await application.evaluate(({ screen }) =>
    screen.emit('display-metrics-changed', {}, screen.getPrimaryDisplay(), [
      'workArea',
    ]),
  );
  await page.waitForTimeout(1900);
  assert.equal(
    await application.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) =>
            window.webContents.getURL().includes('threadline-role=main'),
          )
          .getBounds().width,
    ),
    200,
    'display reconciliation preserves the latest manual width',
  );
  // 发出携带旧宽度的收起请求，Main 必须保留真实当前宽度。
  const collapsed = await page.evaluate(() =>
    window.threadlineDesktop.transitionWindow({
      requestId: 2,
      mode: 'workstation',
      presentation: 'edge-collapsed',
      lastCompactMode: 'workstation',
      windowStates: { workstation: { width: 340, height: 130, x: 500, y: 100 } },
    }),
  );
  assert.equal(
    collapsed.geometry.width,
    200,
    'collapse ignores stale renderer geometry',
  );
  for (const height of [200, 180, 140])
    await page.evaluate(
      (height) => window.threadlineDesktop.resizeCompactContent('workstation', height),
      height,
    );
  await application.evaluate(({ screen }) =>
    screen.emit('display-metrics-changed', {}, screen.getPrimaryDisplay(), [
      'workArea',
    ]),
  );
  // 超过旧 1.5 秒 ACK + 1.5 秒故障恢复期限，期间绝不点击入口。
  await page.waitForTimeout(3500);
  const windows = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      visible: window.isVisible(),
      url: window.webContents.getURL(),
      bounds: window.getBounds(),
    })),
  );
  assert.equal(windows.filter((window) => window.visible).length, 1);
  assert.ok(
    windows.find((window) => window.visible).url.includes('threadline-role=edge-tab'),
    'hidden ACK timeout must not reopen Main',
  );
  const main = windows.find((window) => window.url.includes('threadline-role=main'));
  assert.equal(main.bounds.width, 200);
  assert.equal(
    main.bounds.height,
    130,
    'late content resize must not change collapsed bounds',
  );
  console.log(
    'Static Electron regression passed: manual width, stale collapse geometry, late content height, and unacknowledged display updates.',
  );
} finally {
  await application?.close();
  await rm(userData, { recursive: true, force: true });
}
