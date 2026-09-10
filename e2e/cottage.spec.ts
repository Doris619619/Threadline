/** @fileoverview Exercises the personal cottage through real theme, task, decoration and cross-tab interactions. */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';

test('personal cottage preserves furniture and collapse while task completion grows flowers', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await bootstrapLocalAdapterWorkspace(page, 'cottage-personal');
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await expect(page.locator('.appearance-preview--cottage img')).toBeVisible();
  await expect(page.locator('.appearance-preview--cottage img')).toHaveJSProperty(
    'naturalWidth',
    1536,
  );
  await page.getByRole('button', { name: /皮卡小屋/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cottage');
  await openWorkspaceSection(page, '首页');
  const room = page.getByRole('region', { name: '我的皮卡小屋' });
  await expect(room).toBeVisible();
  await expect(room.locator('img')).toHaveJSProperty('naturalWidth', 1536);
  await room.getByRole('button', { name: '摸摸小猫', exact: true }).click();
  await expect(room.getByRole('status')).toContainText('呼噜');
  await page.clock.runFor(2800);
  await room.getByRole('button', { name: '和房间里的小猫互动' }).click();
  await expect(room.getByRole('status')).toContainText('摸到了');
  await room.getByRole('button', { name: '布置小屋', exact: true }).click();
  await room.getByRole('button', { name: /兔兔抱枕/ }).click();
  await expect(room.locator('[data-furniture]')).toHaveAttribute(
    'data-furniture',
    'bunny',
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cottage');
  await expect(room.locator('[data-furniture]')).toHaveAttribute(
    'data-furniture',
    'bunny',
  );
  const before = Number(
    await room.locator('[data-flowers]').getAttribute('data-flowers'),
  );
  const task = page.locator('.timeline-row').filter({ hasText: '邮件处理' });
  await task.getByRole('checkbox').check();
  await expect(room.locator('[data-flowers]')).toHaveAttribute(
    'data-flowers',
    String(Math.min(5, before + 1)),
  );
  await expect(room.getByRole('status')).toContainText('又做好了一件事');
  await task.getByRole('checkbox').uncheck();
  await expect(room.locator('[data-flowers]')).toHaveAttribute(
    'data-flowers',
    String(before),
  );
  await room.getByRole('button', { name: '收起小屋' }).click();
  await page.reload();
  await expect(room).toHaveAttribute('data-collapsed', 'true');
  await room.getByRole('button', { name: '展开小屋' }).click();
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: '布置小屋', exact: true }).click();
  await other.getByRole('button', { name: /绣球花盆/ }).click();
  await expect(room.locator('[data-furniture]')).toHaveAttribute(
    'data-furniture',
    'hydrangea',
  );
  await other.close();
  await page.clock.runFor(3000);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute(
      'data-color-scheme',
      colorScheme,
    );
    // WebKit's media-query change needs a rendered frame with the installed test clock.
    await page.clock.runFor(300);
    await expect(page.locator('body')).toHaveCSS(
      'color',
      colorScheme === 'dark' ? 'rgb(250, 240, 255)' : 'rgb(68, 61, 89)',
    );
    await expect(page.locator('.tl-header h1')).toHaveCSS(
      'color',
      colorScheme === 'dark' ? 'rgb(250, 240, 255)' : 'rgb(68, 61, 89)',
    );
    await expect(room).toHaveCSS(
      'background-color',
      colorScheme === 'dark' ? 'rgb(43, 49, 83)' : 'rgb(234, 247, 255)',
    );
    await page.screenshot({
      path: `docs/screenshots/cottage/${testInfo.project.name}-${colorScheme}.png`,
      fullPage: true,
    });
    const report = await new AxeBuilder({ page }).analyze();
    expect(
      report.violations.filter(
        (item) => item.impact === 'serious' || item.impact === 'critical',
      ),
    ).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('cottage keeps narrow enlarged layouts and the chooser usable', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'threadline.appearance.v1',
      JSON.stringify({ theme: 'cottage', font: 'default' }),
    ),
  );
  await bootstrapLocalAdapterWorkspace(page, 'cottage-narrow');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const pet = page.getByRole('button', { name: '和房间里的小猫互动' });
  const box = await pet.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await expect(page.getByRole('button', { name: /皮卡小屋/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('button', { name: /默认蓝色/ }).click();
  await openWorkspaceSection(page, '首页');
  await expect(page.getByRole('region', { name: '我的皮卡小屋' })).toHaveCount(0);
});
