/** @fileoverview 按设计系统语义token核对当前导航选中，不依赖某个主题的历史RGB常量。 */
import { expect, type Page } from '@playwright/test';
import { waitForFiniteAnimations } from './animations';

/** 当前入口使用selected token且区别于非选中；保留聚合“更多”入口的独立语义。 */
export async function expectNavigationSelection(page: Page) {
  const active = page
    .locator('.tl-sidebar-item.is-active')
    .filter({ visible: true })
    .first();
  await expect(active).toBeVisible();
  await waitForFiniteAnimations(page);
  const paint = await active.evaluate((node) => {
    const style = getComputedStyle(node);
    const token =
      style.getPropertyValue('--control-selected-bg').trim() ||
      style.getPropertyValue('--interaction-selected').trim();
    // 先交给同一DOM样式管线解析token；Canvas直接解析color-mix可能与CSS管线相差一个通道取整。
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none';
    probe.style.backgroundColor = token;
    node.appendChild(probe);
    const selectedBackground = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    /** 用浏览器颜色解析实际color-mix结果，避免序列化格式与取整差异。 */
    const pixel = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    return {
      actual: pixel(style.backgroundColor),
      selected: pixel(selectedBackground),
      token,
      background: style.backgroundColor,
    };
  });
  expect(paint.actual, '当前导航应使用selected token: ' + paint.token).toEqual(
    paint.selected,
  );
  const other = page
    .locator('.tl-sidebar-item:not(.is-active)')
    .filter({ visible: true })
    .first();
  await expect(other).toBeVisible();
  expect(paint.background).not.toBe(
    await other.evaluate((node) => getComputedStyle(node).backgroundColor),
  );
  return active;
}
