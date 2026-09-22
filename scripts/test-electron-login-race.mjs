/** @fileoverview 使用真实 Electron 窗口并暂停 Edge 加载，确定性覆盖登录与收起的两种完成顺序。 */
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

/** 只有测试进程持有加载闸门；不向生产 preload 暴露测试能力。 */
export async function testElectronLoginRace(application, page) {
  for (const loginFirst of [true, false]) {
    await page.evaluate(() =>
      window.threadlineDesktop.showEntryWindow('authentication'),
    );
    await application.evaluate(({ BrowserWindow }) => {
      const original = BrowserWindow.prototype.loadURL;
      globalThis.issue49Captured = false;
      BrowserWindow.prototype.loadURL = function (url, options) {
        if (!url.includes('threadline-role=edge-tab'))
          return original.call(this, url, options);
        BrowserWindow.prototype.loadURL = original;
        globalThis.issue49Captured = true;
        return new Promise((resolve, reject) => {
          globalThis.issue49Release = (fail) =>
            fail
              ? reject(new Error('delayed edge failure'))
              : original.call(this, url, options).then(resolve, reject);
        });
      };
    });
    await page.evaluate(() => {
      window.issue49Transition = window.threadlineDesktop.transitionWindow({
        requestId: 4900,
        mode: 'workstation',
        presentation: 'edge-collapsed',
        windowStates: { workstation: { width: 200, height: 400 } },
      });
    });
    await expect
      .poll(() => application.evaluate(() => globalThis.issue49Captured))
      .toBe(true);
    if (loginFirst) {
      await page.evaluate(() =>
        window.threadlineDesktop.showEntryWindow('authentication'),
      );
      await application.evaluate(() => {
        if (!globalThis.issue49Captured) throw new Error('Edge was not intercepted');
        globalThis.issue49Release(true);
      });
      const result = await page.evaluate(() => window.issue49Transition);
      assert.equal(
        result.mode,
        'full',
        'Late collapse failure must return current full state',
      );
    } else {
      await application.evaluate(() => {
        if (!globalThis.issue49Captured) throw new Error('Edge was not intercepted');
        globalThis.issue49Release(false);
      });
      await page.evaluate(() => window.issue49Transition);
      await page.evaluate(() =>
        window.threadlineDesktop.showEntryWindow('authentication'),
      );
    }
    const windows = await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => ({
        visible: window.isVisible(),
        bounds: window.getBounds(),
        url: window.webContents.getURL(),
      })),
    );
    const main = windows.find((window) => window.url.includes('threadline-role=main'));
    assert.ok(main?.visible && main.bounds.width > 700, 'Login stays full and visible');
    assert.ok(
      !windows.some((window) => window.visible && window.url.includes('edge-tab')),
      'Late edge cannot hide login',
    );
  }
}
