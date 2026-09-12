/** @fileoverview 习惯页面专用布局验收，避免在尺寸矩阵重复整套业务流程。 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';
import { expectNoUnexpectedHorizontalOverflow } from './support/layout';

test('habits themes, readable controls and contained dialogs', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await bootstrapLocalAdapterWorkspace(page, `habit-layout-${info.testId}`);
  await openWorkspaceSection(page, '习惯');
  await page.getByRole('button', { name: '起床了', exact: true }).click();
  await expect(page.getByTestId('habit-wake')).toContainText('未达标');
  for (const theme of ['blue', 'anya', 'cottage', 'classic']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await expect(page.locator('html')).toHaveAttribute(
        'data-color-scheme',
        colorScheme,
      );
      // Clock 同时驱动主题媒体监听和 RAF；推进两个布局帧，避免等待装饰动画。
      await page.clock.runFor(100);
      await expectNoUnexpectedHorizontalOverflow(page);
      const violations = (
        await new AxeBuilder({ page }).include('.habits-panel').analyze()
      ).violations.filter((item) =>
        ['critical', 'serious'].includes(item.impact ?? ''),
      );
      expect(violations, `${theme} ${colorScheme}`).toEqual([]);
    }
  }
  await page.screenshot({ path: info.outputPath('habits-dark.png'), fullPage: true });
  // Safari 指针点击按钮不自动聚焦；通过键盘打开验证焦点返回原触发点。
  const settingsTrigger = page.getByRole('button', { name: '习惯设置', exact: true });
  await settingsTrigger.focus();
  await settingsTrigger.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(
    await dialog
      .locator('input')
      .first()
      .evaluate((input) => parseFloat(getComputedStyle(input).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await expectNoUnexpectedHorizontalOverflow(page);
  await page.keyboard.press('Tab');
  expect(
    await dialog.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: '习惯设置', exact: true }),
  ).toBeFocused();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectNoUnexpectedHorizontalOverflow(page);
});
