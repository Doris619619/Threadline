/** @fileoverview 习惯页面专用布局验收，避免在尺寸矩阵重复整套业务流程。 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';
import { expectNoUnexpectedHorizontalOverflow } from './support/layout';

/** 检查真正可见的面板和卡片排列，防止主题仅通过无溢出检查却仍显示旧列表。 */
async function expectHabitCardLayout(page: Page) {
  const width = page.viewportSize()!.width;
  if (width >= 1280) {
    const title = (await page.locator('.habit-page-header h1').boundingBox())!;
    const clock = (await page.getByTestId('habit-clock').boundingBox())!;
    expect(clock.x).toBeGreaterThan(title.x + title.width);
    expect(
      Math.abs(clock.y + clock.height / 2 - title.y - title.height / 2),
    ).toBeLessThan(2);
  }
  const today = page.locator(
    '.habit-today > .habit-check-row, .habit-today > .habit-efficiency-row',
  );
  await expect(today).toHaveCount(3);
  for (const selector of [
    '.habit-today-panel',
    '.habit-overview-panel',
    '.habit-trend',
    '.habit-efficiency-trend',
    '.habit-summary > div',
  ]) {
    const styles = await page.locator(selector).evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          border: parseFloat(style.borderTopWidth),
          radius: parseFloat(style.borderRadius),
          background: style.backgroundColor,
        };
      }),
    );
    for (const style of styles) {
      expect(style.border, selector).toBeGreaterThanOrEqual(1);
      expect(style.radius, selector).toBeGreaterThanOrEqual(8);
      expect(style.background, selector).not.toBe('rgba(0, 0, 0, 0)');
    }
  }
  for (const [cards, columns] of [
    [today, width > 1100 ? 3 : 1],
    [page.locator('.habit-summary > div'), width > 760 ? 3 : 1],
  ] as const) {
    const boxes = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width };
      }),
    );
    for (let index = 1; index < boxes.length; index++) {
      expect(Math.abs(boxes[index].width - boxes[0].width)).toBeLessThan(2);
      if (columns === 3) {
        expect(Math.abs(boxes[index].y - boxes[0].y)).toBeLessThan(2);
        expect(boxes[index].x).toBeGreaterThan(boxes[index - 1].x);
      } else {
        expect(Math.abs(boxes[index].x - boxes[0].x)).toBeLessThan(2);
        expect(boxes[index].y).toBeGreaterThan(boxes[index - 1].y);
      }
    }
  }
  if (width >= 1440) {
    expect((await page.locator('.habits-panel').boundingBox())!.width).toBeGreaterThan(
      1000,
    );
  }
}

test('habits themes, readable controls and contained dialogs', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await bootstrapLocalAdapterWorkspace(page, `habit-layout-${info.testId}`);
  await openWorkspaceSection(page, '习惯');
  await page.getByRole('button', { name: '起床了', exact: true }).click();
  await expect(page.getByTestId('habit-wake')).toContainText('未达标');
  await page.getByRole('button', { name: '前一天记录' }).click();
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
      await expectHabitCardLayout(page);
      const violations = (
        await new AxeBuilder({ page }).include('.habits-panel').analyze()
      ).violations.filter((item) =>
        ['critical', 'serious'].includes(item.impact ?? ''),
      );
      expect(violations, `${theme} ${colorScheme}`).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`habits-${theme}-${colorScheme}.png`),
        fullPage: true,
      });
    }
  }
  await page.screenshot({ path: info.outputPath('habits-dark.png'), fullPage: true });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'anya';
  });
  const sleepTrigger = page.getByRole('button', { name: '补录睡觉时间' });
  await sleepTrigger.focus();
  await sleepTrigger.press('Enter');
  const timeEditor = page.getByRole('dialog');
  await expect(timeEditor.getByLabel('睡觉时间', { exact: true })).toBeFocused();
  await expect(timeEditor.getByLabel('睡觉时区', { exact: true })).not.toBeVisible();
  await timeEditor.getByLabel('睡觉时间', { exact: true }).fill('01:10');
  await expect(timeEditor.locator('input:visible')).toHaveCount(1);
  expect(
    await timeEditor.evaluate(
      (element) => element.scrollHeight <= element.clientHeight,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
    ).violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
  ).toEqual([]);
  await expectNoUnexpectedHorizontalOverflow(page);
  await page.screenshot({
    path: info.outputPath('habit-time-editor.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(sleepTrigger).toBeFocused();
  await page
    .getByRole('navigation', { name: '打卡日期' })
    .getByRole('button', { name: '今天', exact: true })
    .click();
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
