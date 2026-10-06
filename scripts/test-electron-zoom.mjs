/** @fileoverview 在真实无菜单 Electron 窗口验证缩放按键、输入框、刷新与同源贴边隔离。 */
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

/** 走 Electron 原生输入链；CDP dispatchKeyEvent 不经过 Main 的 before-input-event。 */
async function pressZoomKey(window, keyCode, modifiers = ['control']) {
  await window.evaluate(
    (window, input) => {
      window.focus();
      window.webContents.sendInputEvent({ type: 'keyDown', ...input });
      window.webContents.sendInputEvent({ type: 'keyUp', ...input });
    },
    { keyCode, modifiers },
  );
}

/** 输入真实键盘组合并核对缩放倍率与原生 bounds；最后恢复原字号并移除隔离探针。 */
export async function testElectronZoom(application, page) {
  const main = await application.browserWindow(page);
  await expect.poll(() => main.evaluate((window) => window.isVisible())).toBe(true);
  const initialBounds = await main.evaluate((window) => window.getBounds());
  const initialWidth = await main.evaluate((window) => window.getContentBounds().width);
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(initialWidth);
  await main.evaluate((window) => window.focus());
  await pressZoomKey(main, '=');
  await expect
    .poll(() => main.evaluate((window) => window.webContents.getZoomFactor()))
    .toBeCloseTo(1.2);
  await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(initialWidth);
  await pressZoomKey(main, '+', ['control', 'shift']);
  await expect
    .poll(() => main.evaluate((window) => window.webContents.getZoomFactor()))
    .toBeCloseTo(1.44);
  await pressZoomKey(main, '-');
  await expect
    .poll(() => main.evaluate((window) => window.webContents.getZoomFactor()))
    .toBeCloseTo(1.2);
  await pressZoomKey(main, '0');
  await expect
    .poll(() => main.evaluate((window) => window.webContents.getZoomFactor()))
    .toBe(1);
  await pressZoomKey(main, 'numadd');
  await expect
    .poll(() => main.evaluate((window) => window.webContents.getZoomFactor()))
    .toBeCloseTo(1.2);
  await pressZoomKey(main, 'numsub');
  await expect
    .poll(() => main.evaluate((window) => window.webContents.getZoomFactor()))
    .toBe(1);
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'zoom-keyboard-probe';
    document.body.append(input);
    input.focus();
  });
  try {
    await pressZoomKey(main, '=');
    await expect
      .poll(() => main.evaluate((window) => window.webContents.getZoomFactor()))
      .toBeCloseTo(1.2);
    await pressZoomKey(main, '0');
  } finally {
    await page.locator('#zoom-keyboard-probe').evaluate((input) => input.remove());
  }
  // 同源新窗口模拟固定尺寸贴边页，隔离模式不应将主窗口的字号带过去。
  const probe = await application.evaluateHandle(async ({ BrowserWindow }, url) => {
    const window = new BrowserWindow({ show: false });
    await window.loadURL(url);
    return window;
  }, page.url());
  try {
    await main.evaluate((window) => window.focus());
    await pressZoomKey(main, '=');
    assert.deepEqual(
      await main.evaluate((window) => window.getBounds()),
      initialBounds,
    );
    await page.reload();
    await expect
      .poll(() => main.evaluate((window) => window.webContents.getZoomFactor()))
      .toBeCloseTo(1.2);
    assert.equal(
      await probe.evaluate((window) => window.webContents.getZoomFactor()),
      1,
    );
    await pressZoomKey(main, '0');
    await expect
      .poll(() => main.evaluate((window) => window.webContents.getZoomFactor()))
      .toBe(1);
  } finally {
    await probe.evaluate((window) => window.destroy());
    await probe.dispose();
  }
  console.log(
    'Electron zoom shortcuts passed: main/numpad, focused input, reload, isolated surface and unchanged bounds.',
  );
}
