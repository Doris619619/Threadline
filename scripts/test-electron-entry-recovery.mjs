/** @fileoverview 使用隔离 userData 和本地无账号页面验证登录门禁可重新展开原生窗口，不访问业务云。 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';
import { verifyEntryWindowCenter } from './verify-entry-window.mjs';

const userData = await mkdtemp(join(tmpdir(), 'threadline-entry-recovery-'));
const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(
    '<!doctype html><title>Threadline entry recovery fixture</title><p>Isolated window test</p>',
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let application;
try {
  application = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      THREADLINE_ELECTRON_RENDERER_URL: `http://127.0.0.1:${server.address().port}`,
    },
  });
  const page = await application.firstWindow();
  await page.waitForFunction(() => Boolean(window.threadlineDesktop));
  // 真实 Renderer 对权威状态回 ACK；测试不引入业务组件或云凭证。
  await page.evaluate(() =>
    window.threadlineDesktop.onNativeStateChanged((event) => {
      void window.threadlineDesktop.acknowledgeNativeState(event.stateRevision);
    }),
  );
  await page.evaluate(() => window.threadlineDesktop.showEntryWindow());
  const initialBounds = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getBounds(),
  );
  await page.evaluate(() => window.threadlineDesktop.showEntryWindow('authentication'));
  assert.deepEqual(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    ),
    initialBounds,
    'startup to login must not reapply full geometry',
  );
  const workstation = await page.evaluate(() =>
    window.threadlineDesktop.hydrateDesktopState({
      requestId: 1,
      mode: 'workstation',
      presentation: 'expanded',
      windowStates: {},
    }),
  );
  /** 读取真实 Main/Edge 可见性及尺寸，而不是用 Renderer CSS 反推原生状态。 */
  const inspect = () =>
    application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({
        role: new URL(w.webContents.getURL()).searchParams.get('threadline-role'),
        visible: w.isVisible(),
        width: w.getBounds().width,
        alwaysOnTop: w.isAlwaysOnTop(),
      })),
    );
  const compact = (await inspect()).find((w) => w.role === 'main');
  assert.ok(compact.width < 800);
  await page.evaluate(() => window.threadlineDesktop.showEntryWindow('startup'));
  assert.equal((await inspect()).find((w) => w.role === 'main').width, compact.width);
  await page.evaluate(() => window.threadlineDesktop.showEntryWindow('authentication'));
  let main = (await inspect()).find((w) => w.role === 'main');
  assert.ok(main.visible && main.width >= 800 && !main.alwaysOnTop);
  await application.evaluate(({ screen }) =>
    screen.emit('display-metrics-changed', {}, screen.getPrimaryDisplay(), [
      'workArea',
    ]),
  );
  assert.ok(
    (await inspect()).find((w) => w.role === 'main').width >= 800,
    'login must remain full after display reconciliation',
  );
  await assert.rejects(
    page.evaluate(() => window.threadlineDesktop.showEntryWindow('invalid')),
    /Rejected entry purpose/,
  );
  const restored = await page.evaluate(() =>
    window.threadlineDesktop.hydrateDesktopState({
      requestId: 2,
      mode: 'workstation',
      presentation: 'edge-collapsed',
      windowStates: {},
    }),
  );
  assert.equal(
    restored.geometry.width,
    workstation.geometry.width,
    'login dimensions must not become the saved workstation width',
  );
  assert.ok((await inspect()).some((w) => w.role === 'edge-tab' && w.visible));
  await page.evaluate(() => window.threadlineDesktop.showEntryWindow('authentication'));
  const windows = await inspect();
  main = windows.find((w) => w.role === 'main');
  assert.ok(main.visible && main.width >= 800);
  assert.ok(!windows.some((w) => w.role === 'edge-tab' && w.visible));
  // 在本机每块真实屏幕上恢复登录，覆盖负坐标和混合 DPI；只覆写测试进程的选屏输入，不移动用户鼠标。
  const displays = await application.evaluate(({ screen }) => screen.getAllDisplays());
  for (const [index, display] of displays.entries()) {
    await application.evaluate(({ screen }, area) => {
      screen.getCursorScreenPoint = () => ({
        x: Math.round(area.x + area.width / 2),
        y: Math.round(area.y + area.height / 2),
      });
    }, display.workArea);
    await page.evaluate(
      (requestId) =>
        window.threadlineDesktop.hydrateDesktopState({
          requestId,
          mode: 'workstation',
          presentation: 'expanded',
          windowStates: {},
        }),
      index + 3,
    );
    await page.evaluate(() =>
      window.threadlineDesktop.showEntryWindow('authentication'),
    );
    const actualDisplay = await application.evaluate(
      ({ screen, BrowserWindow }) =>
        screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).id,
    );
    assert.equal(
      actualDisplay,
      display.id,
      'entry must restore on the selected display',
    );
    verifyEntryWindowCenter(await application.evaluate(() => process.pid));
  }
  console.log(
    'PASS: repeated login entry restores full window; stale startup does not resize workstation; Edge is hidden; invalid purpose rejected; entry centered on every attached display.',
  );
} finally {
  await application?.close();
  server.close();
  // 保留无凭证的临时测试 profile，便于失败后排查；不操作用户真实 userData。
}
