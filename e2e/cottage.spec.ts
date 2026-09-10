/** @fileoverview Verifies unchanged task placement, personal wardrobe persistence and real cross-page pixel-theme contrast. */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';

/** Change themes through the same appearance controls available to users. */
async function chooseTheme(page: Page, name: string) {
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await openWorkspaceSection(page, '首页');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.clock.runFor(350);
}

/** Open the persistent desktop entry or its mobile More counterpart without changing the active page. */
async function openWardrobe(page: Page) {
  await expect(page.locator('.tl-sidebar')).toBeVisible();
  const more = page.getByRole('button', { name: '更多', exact: true });
  if ((await more.isVisible()) && (await more.getAttribute('aria-expanded')) !== 'true')
    await more.click();
  await page.getByRole('button', { name: '我的装扮', exact: true }).click();
  return page.getByRole('dialog', { name: '我的装扮' });
}

/** Await actual paint colors before contrast analysis, including WebKit with the installed test clock. */
async function setScheme(page: Page, colorScheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
  await page.clock.runFor(350);
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', colorScheme);
  await expect(page.locator('body')).toHaveCSS(
    'color',
    colorScheme === 'dark' ? 'rgb(246, 237, 236)' : 'rgb(80, 69, 75)',
  );
  const heading = page.locator('h1').first();
  if (await heading.isVisible())
    await expect(heading).toHaveCSS(
      'color',
      colorScheme === 'dark' ? 'rgb(246, 237, 236)' : 'rgb(80, 69, 75)',
    );
}

/** Report meaningful contrast/semantic failures with offending nodes, rather than silently ignoring selectors. */
async function checkAccessibility(page: Page) {
  const report = await new AxeBuilder({ page }).analyze();
  expect(
    report.violations.filter(
      (item) => item.impact === 'serious' || item.impact === 'critical',
    ),
  ).toEqual([]);
}

test('pixel controls preserve the original task fold and completion behavior', async ({
  page,
}, testInfo) => {
  await bootstrapLocalAdapterWorkspace(page, 'cottage-layout');
  await chooseTheme(page, '默认蓝色');
  const row = page.locator('.timeline-row').filter({ hasText: '邮件处理' });
  const before = await row.boundingBox();
  await chooseTheme(page, '皮卡小屋');
  const after = await row.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(6);
  expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(1);
  await expect(
    page.locator('[data-testid="home-panel"] .cottage-room-image'),
  ).toHaveCount(0);
  await expect(
    page.locator('.cottage-nav-icon > .cottage-sprite').first(),
  ).toBeAttached();
  await row.getByRole('checkbox').check();
  await expect(row.getByRole('checkbox')).toBeChecked();
  await row.getByRole('checkbox').uncheck();
  await expect(row.getByRole('checkbox')).not.toBeChecked();
  for (const scheme of ['light', 'dark'] as const) {
    await setScheme(page, scheme);
    await checkAccessibility(page);
    await page.screenshot({
      path: `docs/screenshots/cottage/${testInfo.project.name}-${scheme}.png`,
      fullPage: true,
    });
  }
});

test('wardrobe keeps personal outfits across reloads and tabs with a native modal', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  await bootstrapLocalAdapterWorkspace(page, 'cottage-outfits');
  await chooseTheme(page, '皮卡小屋');
  const dialog = await openWardrobe(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveJSProperty('open', true);
  await dialog.getByRole('button', { name: '粉色外套', exact: true }).click();
  await expect(
    dialog.locator('.cottage-dressing-mirror .cottage-avatar'),
  ).toHaveAttribute('data-outfit', 'pink');
  await dialog.getByRole('button', { name: '摸摸小猫' }).click();
  await expect(dialog.getByRole('status').first()).toContainText('呼噜');
  await page.clock.runFor(2300);
  await expect(dialog.getByRole('status').first()).toContainText('今天想穿');
  for (const scheme of ['light', 'dark'] as const) {
    await setScheme(page, scheme);
    await checkAccessibility(page);
    await page.screenshot({
      path: `docs/screenshots/cottage/${testInfo.project.name}-wardrobe-${scheme}.png`,
    });
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '我的装扮', exact: true }),
  ).toBeFocused();
  await page.reload();
  await openWardrobe(page);
  await expect(
    dialog.getByRole('button', { name: '粉色外套', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const other = await context.newPage();
  await other.goto('/');
  await openWardrobe(other);
  await other.getByRole('button', { name: '彩虹日常', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: '彩虹日常', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await other.close();
  await dialog.getByRole('button', { name: '关闭装扮' }).click();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await openWardrobe(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await expect(dialog.getByRole('button', { name: '关闭装扮' })).toBeInViewport();
  await dialog.getByRole('button', { name: '关闭装扮' }).click();
});

test('pixel palette is readable across planning projects insights rhythm and settings', async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  await bootstrapLocalAdapterWorkspace(page, 'cottage-surfaces');
  await chooseTheme(page, '皮卡小屋');
  for (const scheme of ['light', 'dark'] as const) {
    await setScheme(page, scheme);
    for (const section of ['规划', '项目', '洞察', '节律', '设置'] as const) {
      await openWorkspaceSection(page, section);
      await page.clock.runFor(350);
      await checkAccessibility(page);
      if (testInfo.project.name === 'desktop')
        await page.screenshot({
          path: `docs/screenshots/cottage/${section}-${scheme}.png`,
        });
    }
  }
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: /默认蓝色/ }).click();
  await expect(page.locator('.cottage-companion')).toHaveCount(0);
});
