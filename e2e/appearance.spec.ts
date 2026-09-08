/** @fileoverview Verifies device themes, real Chinese fonts, layout corrections and reload/cross-tab behavior. */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';

test('keeps independent theme/font choices, renders real fonts and follows system appearance', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await bootstrapLocalAdapterWorkspace(page, 'appearance-choice');
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await expect(page.getByRole('heading', { name: '外观', exact: true })).toHaveCount(1);
  const root = page.locator('html');
  await page.getByRole('button', { name: /安妮雅/ }).click();
  await expect(root).toHaveAttribute('data-theme', 'anya');
  for (const [label, id, family] of [
    ['思源黑体', 'source-han-sans', 'Threadline Source Han Sans'],
    ['思源宋体', 'source-han-serif', 'Threadline Source Han Serif'],
    ['默认字体', 'default', ''],
  ] as const) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await expect(root).toHaveAttribute('data-font', id);
    await expect(root).toHaveAttribute('data-theme', 'anya');
    if (family)
      expect(
        await page.evaluate(async (font) => {
          const faces = await document.fonts.load(
            `16px "${font}"`,
            '把时间留给重要的事',
          );
          return faces.length > 0 && faces.every((face) => face.status === 'loaded');
        }, family),
      ).toBe(true);
  }
  await page.getByRole('button', { name: /思源黑体/ }).click();
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'anya');
  await expect(root).toHaveAttribute('data-font', 'source-han-sans');
  await expect(page.getByRole('heading', { name: '我的工作台' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect
    .poll(() =>
      root.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--background').trim(),
      ),
    )
    .toBe('#291e26');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect
    .poll(() =>
      root.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--background').trim(),
      ),
    )
    .toBe('#fff2f5');
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(() =>
    localStorage.setItem(
      'threadline.appearance.v1',
      JSON.stringify({ theme: 'blue', font: 'source-han-serif' }),
    ),
  );
  await expect(root).toHaveAttribute('data-theme', 'blue');
  await expect(root).toHaveAttribute('data-font', 'source-han-serif');
  await other.evaluate(() => localStorage.removeItem('threadline.appearance.v1'));
  await expect(root).toHaveAttribute('data-font', 'default');
  await other.close();
  expect(errors).toEqual([]);
});

test('keeps a single planning pool and aligns project arrows and trash actions', async ({
  page,
}) => {
  await bootstrapLocalAdapterWorkspace(page, 'appearance-layout');
  await openWorkspaceSection(page, '规划');
  await expect(page.locator('.planning-inbox')).toHaveCount(0);
  await expect(page.locator('.planning-waiting > summary')).toHaveCount(1);
  await openWorkspaceSection(page, '项目');
  await expect(page.getByText('管理长期事项与 Daily 模板')).toHaveCount(0);
  const rows = await page
    .locator('.manager-list--projects .manager-row')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const row = element.getBoundingClientRect();
        const arrow = element
          .querySelector('.manager-row-chevron')!
          .getBoundingClientRect();
        return row.right - arrow.right;
      }),
    );
  expect(rows.length).toBeGreaterThan(0);
  for (const gap of rows) expect(gap).toBeGreaterThanOrEqual(15);
  for (const gap of rows) expect(gap).toBeLessThanOrEqual(17);
  await page.evaluate(() => {
    const key = 'threadline.tasks.v1';
    const tasks = JSON.parse(localStorage.getItem(key) ?? '[]');
    tasks.push({
      ...tasks[0],
      id: 'trash-layout',
      title: '这是一个很长的回收站任务标题，用来检查窄屏上的换行与恢复按钮',
      status: 'trashed',
      deletedAt: new Date().toISOString(),
    });
    localStorage.setItem(key, JSON.stringify(tasks));
  });
  await page.reload();
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '回收站', exact: true }).click();
  await expect(page.getByRole('heading', { name: '设置', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '回收站', exact: true })).toHaveCount(
    1,
  );
  const row = page.locator('.trash-row').filter({ hasText: '这是一个很长的' });
  await expect(row).toBeVisible();
  const sizes = await row.evaluate((element) => {
    const row = element.getBoundingClientRect();
    const button = element.querySelector('button')!.getBoundingClientRect();
    return { row: row.width, button: button.width, height: button.height };
  });
  expect(sizes.button).toBeLessThan(sizes.row / 2);
  expect(sizes.height).toBeGreaterThanOrEqual(44);
  await row.getByRole('button').click();
  await expect(row).toHaveCount(0);
});

test('recovers from a failed font request without losing the selected theme', async ({
  page,
}) => {
  await bootstrapLocalAdapterWorkspace(page, 'appearance-font-retry');
  await page.route('**/fonts/*.woff2', (route) => route.abort());
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: /安妮雅/ }).click();
  await page.getByRole('button', { name: /思源黑体/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font-error', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-font', 'default');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'anya');
  await page.unroute('**/fonts/*.woff2');
  await page.getByRole('button', { name: /思源黑体/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'source-han-sans');
  await expect(page.locator('html')).toHaveAttribute('data-font-error', 'false');
  await page.getByRole('button', { name: /默认蓝色/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'source-han-sans');
  await expect(page.locator('html')).toHaveAttribute('data-font-error', 'false');
});

test('keeps the appearance chooser accessible in both Anya light and dark modes', async ({
  page,
}) => {
  await bootstrapLocalAdapterWorkspace(page, 'appearance-accessibility');
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: /安妮雅/ }).click();
  await page.evaluate(() => document.fonts.ready);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.evaluate(async () => {
      void document.documentElement.offsetWidth;
      await Promise.allSettled(
        document.getAnimations().map((animation) => animation.finished),
      );
    });
    const report = await new AxeBuilder({ page }).analyze();
    expect(
      report.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      ),
    ).toEqual([]);
  }
});

test('keeps all pink calendar heat levels readable and enlarged task titles wide', async ({
  page,
}) => {
  await bootstrapLocalAdapterWorkspace(page, 'appearance-dense');
  await page.evaluate(() => {
    localStorage.setItem(
      'threadline.appearance.v1',
      JSON.stringify({ theme: 'anya', font: 'default' }),
    );
    const tasks = JSON.parse(localStorage.getItem('threadline.tasks.v1') ?? '[]');
    const source = tasks.find((task: { status: string }) => task.status === 'active');
    const extra = [1, 3, 6, 12].flatMap((count, day) =>
      Array.from({ length: count }, (_, index) => ({
        ...source,
        id: `pink-density-${day}-${index}`,
        date: `2026-08-0${day + 1}`,
        completed: false,
      })),
    );
    localStorage.setItem('threadline.tasks.v1', JSON.stringify([...tasks, ...extra]));
  });
  await page.reload();
  await openWorkspaceSection(page, '规划');
  await expect(
    page.locator('[data-date="2026-08-04"] .planning-date-count'),
  ).toHaveText('12 项');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.evaluate(async () => {
      void document.documentElement.offsetWidth;
      await Promise.allSettled(
        document.getAnimations().map((animation) => animation.finished),
      );
    });
    const report = await new AxeBuilder({ page }).analyze();
    expect(
      report.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      ),
    ).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await openWorkspaceSection(page, '首页');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(page.locator('.tl-header .theme-illustration')).toBeHidden();
  const title = page.locator('.timeline-row .task-title').first();
  expect(
    await title.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(140);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
