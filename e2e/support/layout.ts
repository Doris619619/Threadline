/**
 * @fileoverview 提供不会冻结视觉设计的 Playwright 布局结构断言。
 */

import { expect, type Locator, type Page } from '@playwright/test';

type Viewport = { width: number; height: number };

/** 读取浏览器布局 viewport，避免把设备描述符中的历史尺寸当作当前事实。 */
async function getViewport(page: Page): Promise<Viewport> {
  return page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
}

/**
 * 断言文档根节点没有意外的全局横向滚动；局部可横向滚动区域不影响该合同。
 */
export async function expectNoUnexpectedHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    `页面出现全局横向溢出：${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`,
  ).toBeLessThanOrEqual(dimensions.clientWidth);
}

/**
 * 断言关键 shell 或页面模块具有实际尺寸，且横向没有超出当前 viewport。
 */
export async function expectElementWithinHorizontalViewport(
  page: Page,
  locator: Locator,
  label: string,
) {
  const [viewport, box] = await Promise.all([getViewport(page), locator.boundingBox()]);
  expect(box, `${label} 未渲染或不可见`).not.toBeNull();
  const resolved = box!;
  expect(resolved.width, `${label} 宽度无效`).toBeGreaterThan(0);
  expect(resolved.height, `${label} 高度无效`).toBeGreaterThan(0);
  expect(resolved.x, `${label} 左侧超出 viewport`).toBeGreaterThanOrEqual(0);
  expect(resolved.x + resolved.width, `${label} 右侧超出 viewport`).toBeLessThanOrEqual(
    viewport.width + 1,
  );
}

/**
 * 断言弹窗或 Popover 的完整矩形落在 viewport 内，不约束其像素尺寸、样式或排版细节。
 */
export async function expectElementFullyWithinViewport(
  page: Page,
  locator: Locator,
  label: string,
) {
  const [viewport, box] = await Promise.all([getViewport(page), locator.boundingBox()]);
  expect(box, `${label} 未渲染或不可见`).not.toBeNull();
  const resolved = box!;
  expect(resolved.width, `${label} 宽度无效`).toBeGreaterThan(0);
  expect(resolved.height, `${label} 高度无效`).toBeGreaterThan(0);
  expect(resolved.x, `${label} 左侧被裁切`).toBeGreaterThanOrEqual(0);
  expect(resolved.y, `${label} 顶部被裁切`).toBeGreaterThanOrEqual(0);
  expect(resolved.x + resolved.width, `${label} 右侧被裁切`).toBeLessThanOrEqual(
    viewport.width + 1,
  );
  expect(resolved.y + resolved.height, `${label} 底部被裁切`).toBeLessThanOrEqual(
    viewport.height + 1,
  );
}

/**
 * 断言两个稳定结构区域的矩形不相交，用于检测标题、工具栏或主内容互相覆盖。
 */
export async function expectElementsNotToOverlap(
  first: Locator,
  second: Locator,
  label: string,
) {
  const [firstBox, secondBox] = await Promise.all([
    first.boundingBox(),
    second.boundingBox(),
  ]);
  expect(firstBox, `${label} 的第一个区域未渲染或不可见`).not.toBeNull();
  expect(secondBox, `${label} 的第二个区域未渲染或不可见`).not.toBeNull();
  const firstResolved = firstBox!;
  const secondResolved = secondBox!;
  const overlaps = !(
    firstResolved.x + firstResolved.width <= secondResolved.x ||
    secondResolved.x + secondResolved.width <= firstResolved.x ||
    firstResolved.y + firstResolved.height <= secondResolved.y ||
    secondResolved.y + secondResolved.height <= firstResolved.y
  );
  expect(overlaps, `${label} 发生重叠`).toBe(false);
}

/**
 * 断言当前可见主导航只有一个激活项；桌面和移动导航会同时存在于 DOM，但仅其一可见。
 */
export async function expectOneVisibleActiveMainNavigation(page: Page) {
  await expect(
    page.locator(
      '.tl-desktop-nav:visible .tl-sidebar-item.is-active, .tl-mobile-nav:visible .tl-sidebar-item.is-active',
    ),
  ).toHaveCount(1);
}
