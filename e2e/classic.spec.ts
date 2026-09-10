/** @fileoverview Validate the independent classic theme, readable window proportions, cross-page palettes and saved appearance. */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
  openSeededTaskEditor,
} from './support/workspace';

/** Select a named theme through settings without bypassing persisted appearance behavior. */
async function selectTheme(page: Page, name: string) {
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await openWorkspaceSection(page, '首页');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.clock.runFor(350);
  // Keep requestAnimationFrame running for subsequent WebKit pointer stability checks.
  await page.clock.resume();
}

/** Check actual rendered contrast and retain actionable axe node details. */
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((issue) => ['serious', 'critical'].includes(issue.impact)),
  ).toEqual([]);
}

test('classic frames keep tasks at the fold and the cottage theme remains independent', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await bootstrapLocalAdapterWorkspace(page, 'classic-layout');
  await selectTheme(page, '皮卡小屋');
  const row = page.locator('.timeline-row').filter({ hasText: '邮件处理' });
  const before = await row.boundingBox();
  await selectTheme(page, '皮卡经典');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic');
  await expect(page.locator('.tl-main')).toHaveCSS('border-image-source', 'none');
  await expect(page.locator('.tl-main')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.schedule-panel')).toHaveCSS(
    'border-image-source',
    'none',
  );
  const after = await row.boundingBox();
  expect(after!.y - before!.y).toBeLessThan(24);
  expect(after!.width).toBeGreaterThan(before!.width - 5);
  expect(
    await page
      .locator('.task-title')
      .first()
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await row.getByRole('checkbox').check();
  await expect(row.getByRole('checkbox')).toBeChecked();
  await row.getByRole('checkbox').uncheck();
  await expect(row.getByRole('checkbox')).not.toBeChecked();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic');
  await expect(page.locator('.tl-brand-mark')).toHaveCSS(
    'background-image',
    /themes\/classic\/icon.svg/,
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({
    path: `docs/screenshots/classic/${testInfo.project.name}-home.png`,
    fullPage: true,
  });
  await selectTheme(page, '皮卡小屋');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cottage');
  await expect(page.locator('.schedule-panel')).toHaveCSS(
    'border-image-source',
    'none',
  );
});

test('classic light and dark windows remain readable throughout the app', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await bootstrapLocalAdapterWorkspace(page, 'classic-pages');
  await selectTheme(page, '皮卡经典');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.clock.runFor(400);
    await expect(page.locator('html')).toHaveAttribute(
      'data-color-scheme',
      colorScheme,
    );
    for (const section of ['首页', '规划', '项目', '洞察', '节律', '设置'] as const) {
      await openWorkspaceSection(page, section);
      await page.clock.runFor(350);
      await expect(page.locator('h1').first()).toHaveCSS(
        'color',
        colorScheme === 'dark' ? 'rgb(255, 247, 212)' : 'rgb(37, 37, 20)',
      );
      await accessible(page);
      if (testInfo.project.name === 'desktop')
        await page.screenshot({
          path: `docs/screenshots/classic/${section}-${colorScheme}.png`,
        });
    }
  }
});

test('classic wardrobe and all four choices fit mobile with enlarged text', async ({
  page,
}, testInfo) => {
  await bootstrapLocalAdapterWorkspace(page, 'classic-wardrobe');
  await selectTheme(page, '皮卡经典');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '我的装扮', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '我的装扮' });
  await expect(dialog).toHaveCSS('border-image-source', /classic\/frame.svg/);
  await accessible(page);
  await page.screenshot({
    path: `docs/screenshots/classic/${testInfo.project.name}-wardrobe.png`,
  });
  await dialog.getByRole('button', { name: '关闭装扮' }).click();
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  for (const name of ['默认蓝色', '安妮雅', '皮卡小屋', '皮卡经典'])
    await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
});

test('classic task windows retain readable controls and a working close action', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await bootstrapLocalAdapterWorkspace(page, 'classic-task-dialog');
  await selectTheme(page, '皮卡经典');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.clock.runFor(350);
    await page.clock.resume();
    await openSeededTaskEditor(page);
    const dialog = page.getByRole('dialog', { name: '编辑任务', exact: true });
    await expect(dialog).toHaveCSS(
      'border-image-source',
      /classic\/frame(?:-dark)?.svg/,
    );
    // A sticky touch hover menu must never cover the editor's project selector.
    await expect
      .poll(() =>
        dialog.locator('select').evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return node.contains(
            document.elementFromPoint(rect.right - 12, rect.bottom - 12),
          );
        }),
      )
      .toBe(true);
    await accessible(page);
    await page.screenshot({
      path: `docs/screenshots/classic/${testInfo.project.name}-editor-${colorScheme}.png`,
    });
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
});
