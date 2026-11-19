/** @fileoverview 用隔离 Electron 真实窗口验证方案 A 菜单在100/125/150/250%缩放与常见窗口尺寸中的可用性。 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';

/** 同时验证原生窗口落在真实工作区内及可见状态，避免把屏外 Renderer 的 DOM 命中误报为屏幕可达。 */
async function nativeGeometry(application, id) {
  return application.evaluate(({ BrowserWindow, screen }, id) => {
    const window = BrowserWindow.fromId(id);
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const area = display.workArea;
    return {
      bounds,
      contentBounds: window.getContentBounds(),
      visible: window.isVisible(),
      minimized: window.isMinimized(),
      display: { id: display.id, scaleFactor: display.scaleFactor, workArea: area },
      insideWorkArea:
        bounds.x >= area.x &&
        bounds.y >= area.y &&
        bounds.x + bounds.width <= area.x + area.width &&
        bounds.y + bounds.height <= area.y + area.height,
    };
  }, id);
}

/** Electron zoom下CDP截图可能是单色裁剪；直接捕获原生可见页面并拒绝空白证据。 */
async function captureNativePage(window, page, path) {
  await window.evaluate((window) => {
    window.focus();
    window.webContents.focus();
  });
  await page.bringToFront();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  const captured = await window.evaluate(async (window) => {
    const image = await window.webContents.capturePage();
    const pixels = image.getBitmap();
    const counts = new Map();
    let dominant = 0;
    for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
      const value = pixels.readUInt32LE(offset);
      const count = (counts.get(value) ?? 0) + 1;
      counts.set(value, count);
      dominant = Math.max(dominant, count);
    }
    return {
      png: image.toPNG().toString('base64'),
      size: image.getSize(),
      colors: counts.size,
      nonDominantFraction: pixels.length ? 1 - dominant / (pixels.length / 4) : 0,
    };
  });
  assert.ok(
    captured.colors >= 8 && captured.nonDominantFraction >= 0.005,
    'native screenshot must contain visible controls, not a blank background',
  );
  await writeFile(path, Buffer.from(captured.png, 'base64'));
  return {
    method: 'Electron.webContents.capturePage',
    size: captured.size,
    colors: captured.colors,
    nonDominantFraction: captured.nonDominantFraction,
  };
}

/** setZoomFactor来自已安装Electron44类型文档；测试尺寸按真实DIP工作区约束，finally恢复原生状态。 */
export async function testElectronHigZoom(application, page) {
  const window = await application.browserWindow(page);
  const original = await window.evaluate((window) => ({
    id: window.id,
    bounds: window.getBounds(),
    zoom: window.webContents.getZoomFactor(),
    visible: window.isVisible(),
    minimized: window.isMinimized(),
    maximized: window.isMaximized(),
  }));
  const output = resolve('test-results/electron-hig');
  await mkdir(output, { recursive: true });
  const evidence = [];
  try {
    for (const requested of [
      { width: 1000, height: 600 },
      { width: 850, height: 500 },
    ]) {
      const clamped = await application.evaluate(
        ({ BrowserWindow, screen }, { id, requested }) => {
          const window = BrowserWindow.fromId(id);
          if (window.isMaximized()) window.unmaximize();
          if (window.isMinimized()) window.restore();
          const area = screen.getDisplayMatching(window.getBounds()).workArea;
          const bounds = window.getBounds();
          const content = window.getContentBounds();
          const target = {
            width: Math.min(
              requested.width,
              area.width - (bounds.width - content.width),
            ),
            height: Math.min(
              requested.height,
              area.height - (bounds.height - content.height),
            ),
          };
          window.setContentSize(target.width, target.height);
          // 原生最小尺寸可能使实际尺寸大于请求；按实际 bounds 居中，随后必须通过工作区包含性断言。
          const actual = window.getBounds();
          window.setPosition(
            area.x + Math.floor((area.width - actual.width) / 2),
            area.y + Math.floor((area.height - actual.height) / 2),
          );
          window.show();
          return target;
        },
        { id: original.id, requested },
      );
      await page.bringToFront();
      await expect
        .poll(async () => {
          const actual = await nativeGeometry(application, original.id);
          return actual.visible && !actual.minimized && actual.insideWorkArea;
        })
        .toBe(true);
      for (const factor of [1, 1.25, 1.5, 2.5]) {
        await window.evaluate(
          (window, factor) => window.webContents.setZoomFactor(factor),
          factor,
        );
        await expect
          .poll(() => window.evaluate((window) => window.webContents.getZoomFactor()))
          .toBe(factor);
        await expect
          .poll(async () => {
            const native = await window.evaluate((window) => window.getContentSize());
            const rendered = await page.evaluate(() => ({
              width: innerWidth,
              height: innerHeight,
            }));
            return (
              Math.abs(rendered.width * factor - native[0]) < factor + 1 &&
              Math.abs(rendered.height * factor - native[1]) < factor + 1
            );
          })
          .toBe(true);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          'full workspace must fit the native content at each zoom',
        );
        const chrome = page.locator('.full-window-chrome');
        const blocked = await chrome.locator('button').evaluateAll((buttons) =>
          buttons.flatMap((button) => {
            if (!button.getClientRects().length) return [];
            const bounds = button.getBoundingClientRect();
            const hit = document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            );
            return bounds.left < 0 ||
              bounds.right > innerWidth + 1 ||
              bounds.top < 0 ||
              bounds.bottom > innerHeight + 1 ||
              !button.contains(hit)
              ? [button.getAttribute('aria-label') ?? button.textContent]
              : [];
          }),
        );
        assert.deepEqual(
          blocked,
          [],
          'native window controls retain visible hit regions',
        );
        const trigger = page.getByRole('button', { name: /^右栏显示内容：/ });
        await trigger.scrollIntoViewIfNeeded();
        await trigger.press('Enter');
        const menu = page.getByRole('menu', { name: '右栏显示内容', exact: true });
        await expect(menu).toBeVisible();
        assert.equal(
          await menu.evaluate((node) => {
            const bounds = node.getBoundingClientRect();
            return (
              bounds.left >= 0 &&
              bounds.right <= innerWidth + 1 &&
              bounds.top >= 0 &&
              bounds.bottom <= innerHeight + 1
            );
          }),
          true,
          'menu must remain inside the native renderer viewport',
        );
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        await expect(trigger).toHaveCSS('outline-style', 'none');
        const paint = await captureNativePage(
          window,
          page,
          resolve(
            output,
            `full-${requested.width}x${requested.height}-${Math.round(factor * 100)}.png`,
          ),
        );
        const actual = await nativeGeometry(application, original.id);
        assert.ok(
          actual.visible && !actual.minimized,
          'test window must remain visibly restored',
        );
        assert.ok(
          actual.insideWorkArea,
          'native window bounds must fit the actual display work area',
        );
        evidence.push({
          requested,
          clamped,
          actual,
          factor,
          paint,
          viewport: await page.evaluate(() => ({
            width: innerWidth,
            height: innerHeight,
          })),
        });
      }
    }
  } finally {
    await window.evaluate((window, original) => {
      window.webContents.setZoomFactor(original.zoom);
      window.setBounds(original.bounds);
      if (original.maximized) window.maximize();
      if (original.minimized) window.minimize();
      else if (original.visible) window.show();
      else window.hide();
    }, original);
  }
  await writeFile(resolve(output, 'matrix.json'), JSON.stringify(evidence, null, 2));
  console.log('Electron HIG zoom matrix passed:', JSON.stringify(evidence));
}
