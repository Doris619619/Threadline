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
      (window.desktopEvents ??= []).push(event);
      if (document.visibilityState === 'visible')
        void window.threadlineDesktop.acknowledgeNativeState(event.stateRevision);
    }),
  );
  await page.evaluate(() =>
    window.threadlineDesktop.transitionWindow({
      requestId: 1,
      mode: 'workstation',
      presentation: 'expanded',
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
      windowStates: { workstation: { width: 340, height: 130, x: 500, y: 100 } },
    }),
  );
  assert.equal(
    collapsed.geometry.width,
    200,
    'collapse ignores stale renderer geometry',
  );
  // 已进入业务窗口后，迟到的启动层居中请求也不能把它重新显示。
  await page.evaluate(() => window.threadlineDesktop.showEntryWindow());
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
  if (
    !windows.find((window) => window.visible)?.url.includes('threadline-role=edge-tab')
  )
    console.log(
      'FAILURE STATE',
      windows,
      await page.evaluate(() => window.desktopEvents),
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
  const edge = application
    .windows()
    .find((window) => window.url().includes('threadline-role=edge-tab'));
  assert.ok(edge);
  // 只替换输入坐标以避免抢走用户鼠标；IPC、BrowserWindow、Windows DPI 转换全部真实执行。
  await application.evaluate(({ screen }) => {
    globalThis.originalCursorReader = screen.getCursorScreenPoint;
    globalThis.edgeTestCursor = { x: 900, y: 300 };
    screen.getCursorScreenPoint = () => globalThis.edgeTestCursor;
  });
  /** 从原生窗口读取宽高，不能用 Renderer viewport 或模拟 geometry 作为验收值。 */
  const readEdgeBounds = () =>
    application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) =>
          window.webContents.getURL().includes('threadline-role=edge-tab'),
        )
        .getBounds(),
    );
  const baseline = await readEdgeBounds();
  /** Electron 可以保持隐藏页面的 visibilityState；是否展开以原生 surface 为准。 */
  const isMainVisible = () =>
    application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('threadline-role=main'))
        .isVisible(),
    );
  await edge.evaluate(() => window.threadlineDesktop.edgePointer('start'));
  for (let index = 0; index < 100; index++) {
    assert.equal(
      await edge.evaluate(() => window.threadlineDesktop.edgePointer('move')),
      false,
    );
  }
  assert.deepEqual(
    await readEdgeBounds(),
    baseline,
    'holding still never resizes the edge',
  );
  await edge.evaluate(() => window.threadlineDesktop.edgePointer('cancel'));
  const samples = [];
  for (const side of ['left', 'right']) {
    await edge.evaluate(() => window.threadlineDesktop.edgePointer('start'));
    for (let index = 0; index < 120; index++) {
      await application.evaluate(
        ({ screen }, { side, index }) => {
          const area = screen.getPrimaryDisplay().workArea;
          globalThis.edgeTestCursor = {
            x: area.x + (side === 'left' ? 20 : area.width - 20) + (index % 2),
            y: area.y + 100 + (index % 30),
          };
        },
        { side, index },
      );
      assert.equal(
        await edge.evaluate(() => window.threadlineDesktop.edgePointer('move')),
        true,
      );
      const bounds = await readEdgeBounds();
      assert.ok(
        Math.abs(bounds.width - baseline.width) <= 1,
        'drag never accumulates width',
      );
      assert.ok(
        Math.abs(bounds.height - baseline.height) <= 1,
        'drag never accumulates height',
      );
      if (index === 119) samples.push({ side, bounds });
    }
    assert.equal(
      await edge.evaluate(() => window.threadlineDesktop.edgePointer('end')),
      true,
    );
    const snapped = await readEdgeBounds();
    const area = await application.evaluate(
      ({ screen }) => screen.getPrimaryDisplay().workArea,
    );
    assert.ok(
      Math.abs(
        snapped.x - (side === 'left' ? area.x : area.x + area.width - snapped.width),
      ) <= 2,
    );
    assert.ok(
      Math.abs(snapped.height - baseline.height) <= 1,
      'snapping keeps the fixed height',
    );
    assert.equal(
      await isMainVisible(),
      false,
      'dragging never expands the workstation',
    );
  }
  // 显示器通知同样经过固定尺寸定位，不能重新放大入口。
  for (let index = 0; index < 20; index++) {
    await application.evaluate(({ screen }) =>
      screen.emit('display-metrics-changed', {}, screen.getPrimaryDisplay(), [
        'scaleFactor',
      ]),
    );
  }
  await page.waitForTimeout(500);
  assert.ok(Math.abs((await readEdgeBounds()).height - baseline.height) <= 1);
  if (process.env.THREADLINE_EDGE_SCREENSHOT)
    await edge.screenshot({ path: process.env.THREADLINE_EDGE_SCREENSHOT });
  await application.evaluate(({ screen }) => {
    screen.getCursorScreenPoint = globalThis.originalCursorReader;
  });
  await edge.locator('.edge-tab').hover();
  await page.waitForTimeout(400);
  assert.equal(await isMainVisible(), false, 'hover never expands');
  await edge.locator('.edge-tab').click();
  for (let attempt = 0; attempt < 40 && !(await isMainVisible()); attempt++)
    await page.waitForTimeout(100);
  assert.equal(await isMainVisible(), true, 'click restores the native workstation');
  const restored = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('threadline-role=main'))
      .getBounds(),
  );
  assert.equal(restored.width, 200, 'click restores the small workstation');
  console.log(
    JSON.stringify({
      nativeEdgeRegression: {
        baseline,
        samples,
        scale: await application.evaluate(
          ({ screen }) => screen.getPrimaryDisplay().scaleFactor,
        ),
      },
    }),
  );
  console.log(
    'Static Electron regression passed: manual width, stale collapse geometry, late content height, and unacknowledged display updates.',
  );
} finally {
  await application?.close();
  await rm(userData, { recursive: true, force: true });
}
