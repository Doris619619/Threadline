/** @fileoverview 通过真实规划界面验证跨日创建、提前改期、安排与首页日期隔离。 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';

test.beforeEach(async ({ page }, info) => {
  await bootstrapLocalAdapterWorkspace(page, `planning.${info.testId}`);
  await openWorkspaceSection(page, '规划');
});

test('creates next week work, brings it forward, completes it and keeps home on today', async ({
  page,
}) => {
  await page.getByRole('button', { name: '下一周', exact: true }).click();
  await page.getByRole('button', { name: '添加任务', exact: true }).first().click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('textbox', { name: '任务名称' }).fill('下周研究安排');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  let row = page.locator('.planning-task').filter({ hasText: '下周研究安排' });
  await expect(row).toBeVisible();
  await row.getByLabel('下周研究安排更多操作').click();
  await row.getByRole('button', { name: '改期', exact: true }).click();
  await page.getByLabel('移期日期').fill('2026-08-24');
  await page.getByRole('button', { name: '确认改期' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await page
    .locator('.planning-week')
    .getByRole('button', { name: /^2026-08-24，/ })
    .click();
  row = page.locator('.planning-task').filter({ hasText: '下周研究安排' });
  await row.getByRole('checkbox').click();
  await page.locator('.planning-completed > summary').click();
  await expect(row.getByRole('checkbox')).toBeChecked();
  await openWorkspaceSection(page, '首页');
  await expect(page.locator('.schedule-panel')).not.toContainText('下周研究安排');
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('threadline.tasks.v1') ?? '[]'),
  );
  expect(
    stored.find((item: { title: string }) => item.title === '下周研究安排'),
  ).toMatchObject({ date: '2026-08-24', completed: true, postponedFrom: '2026-08-30' });
});

test('selects a month date, schedules waiting work and preserves task counts on completion', async ({
  page,
}, info) => {
  await page.getByRole('button', { name: '2026 年 8 月' }).click();
  const month = page.getByRole('dialog', { name: '选择日期' });
  await month.getByRole('button', { name: /^2026-08-25，/ }).click();
  await expect(month).toHaveCount(0);
  await page.locator('.planning-waiting > summary').click();
  const row = page
    .locator('.planning-waiting .planning-task')
    .filter({ hasText: '取快递' });
  await row.getByRole('button', { name: '安排到 8/25' }).click();
  await expect(row).toHaveCount(0);
  await expect(
    page.locator('.planning-agenda .planning-task').filter({ hasText: '取快递' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const report = await new AxeBuilder({ page }).analyze();
  expect(
    report.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('planning.png'), fullPage: true });
});

test('keeps dark month selection accessible and restores keyboard focus', async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const trigger = page.getByRole('button', { name: '2026 年 8 月' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '选择日期' });
  await expect(dialog.getByRole('button', { name: /^2026-08-23，/ })).toBeFocused();
  const report = await new AxeBuilder({ page }).analyze();
  expect(
    report.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath('planning-month-dark.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
