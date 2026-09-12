/** @fileoverview 习惯真实页面流程：直接导航、一键记录、历史编辑、独立边界和刷新恢复。 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';

test.describe('account timezone independent of the operating system', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('China clock, direct midnight editing and all-page dates survive reload', async ({
    page,
  }) => {
    await bootstrapLocalAdapterWorkspace(page, 'account-zone');
    await openWorkspaceSection(page, '设置');
    await page.getByRole('button', { name: /日期与时区/ }).click();
    await page.getByLabel('账号时区', { exact: true }).selectOption('Asia/Shanghai');
    await page.getByRole('button', { name: '保存时区', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('已保存');
    await page.clock.setSystemTime(new Date('2026-09-12T17:10:12.345Z'));
    await page.clock.runFor(1100);
    await openWorkspaceSection(page, '习惯');
    await expect(page.getByTestId('habit-clock')).toContainText('9月13日');
    await expect(page.getByTestId('habit-clock')).toContainText('星期日');
    await expect(page.getByTestId('habit-clock')).toContainText('01:10');
    await expect(page.getByTestId('habit-clock')).toContainText('北京时间');
    await page.getByRole('button', { name: '睡觉了', exact: true }).click();
    const sleep = page.getByTestId('habit-sleep');
    await expect(sleep).toContainText('09月12日');
    await expect(
      sleep.getByRole('button', { name: /编辑睡觉时间 01:10/ }),
    ).toBeVisible();
    await sleep.getByRole('button', { name: /编辑睡觉时间/ }).click();
    const editor = page.getByRole('dialog');
    await expect(editor.getByLabel('睡觉时间', { exact: true })).toBeFocused();
    await editor.getByLabel('睡觉时间', { exact: true }).fill('01:05');
    await editor.getByRole('button', { name: '保存记录', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect(
      sleep.getByRole('button', { name: /编辑睡觉时间 01:05/ }),
    ).toBeVisible();
    await page.reload();
    await openWorkspaceSection(page, '习惯');
    await expect(page.getByTestId('habit-clock')).toContainText('北京时间');
    await expect(sleep).toContainText('01:05');
    await page.getByRole('button', { name: '起床了', exact: true }).click();
    await expect(page.getByTestId('habit-wake')).toContainText('01:10');
    await openWorkspaceSection(page, '规划');
    await expect(page.locator('.planning-panel')).toContainText('2026');
    await openWorkspaceSection(page, '首页');
    await expect(page.locator('time[datetime="2026-09-13"]')).toContainText('09-13');
  });
});

test('midnight records retain separate dates and roll over at 04:00', async ({
  page,
}) => {
  await bootstrapLocalAdapterWorkspace(page, 'habits-midnight');
  await page.clock.setSystemTime(new Date('2026-08-23T00:20:00+08:00'));
  await openWorkspaceSection(page, '习惯');
  await page.getByRole('button', { name: '睡觉了', exact: true }).click();
  await expect(page.getByTestId('habit-sleep')).toContainText('08月22日');
  await expect(page.getByTestId('habit-sleep')).toContainText('较晚');
  await page.getByRole('button', { name: '起床了', exact: true }).click();
  await expect(page.getByTestId('habit-clock')).toContainText('8月23日');
  await page.clock.setSystemTime(new Date('2026-08-23T04:00:00+08:00'));
  await page.clock.runFor(1100);
  await expect(page.getByTestId('habit-sleep')).not.toContainText('08月22日');
  await expect(page.getByRole('button', { name: '睡觉了', exact: true })).toBeEnabled();
  await expect(page.getByTestId('habit-wake')).toContainText('00:20');
});

test('habits record, history, settings and accessible mobile navigation', async ({
  page,
}, testInfo) => {
  await bootstrapLocalAdapterWorkspace(page, 'habits-flow');
  await openWorkspaceSection(page, '习惯');
  await expect(page.getByRole('heading', { name: '习惯', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '起床了', exact: true }).click();
  await expect(page.getByTestId('habit-wake')).toContainText('12:00');
  await expect(
    page.getByTestId('habit-wake').getByRole('button', { name: /编辑起床时间/ }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '睡觉了', exact: true }).click();
  await expect(page.getByTestId('habit-sleep')).toContainText('达标');
  await page
    .getByLabel('当天工作效率', { exact: true })
    .getByRole('button', { name: '好', exact: true })
    .click();
  await expect(
    page
      .getByLabel('当天工作效率', { exact: true })
      .getByRole('button', { name: '好', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByText('历史与补录', { exact: true }).click();
  await page
    .locator('.habit-calendar')
    .getByRole('button', { name: '2026-08-22 未记录', exact: true })
    .click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('睡觉实际时间', { exact: true }).fill('2026-08-23T00:20');
  await editor.getByLabel('补录工作效率', { exact: true }).selectOption('medium');
  await editor.getByRole('button', { name: '保存记录' }).click();
  await expect(editor).not.toBeVisible();
  await expect(
    page
      .locator('.habit-calendar')
      .getByRole('button', { name: '2026-08-22 较晚', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '习惯设置', exact: true }).click();
  await editor.getByLabel('起床目标', { exact: true }).fill('07:00');
  await editor.getByLabel('达标上限', { exact: true }).fill('23:10');
  await editor.getByLabel('较晚起点', { exact: true }).fill('00:10');
  await editor.getByLabel('较晚上限', { exact: true }).fill('00:40');
  await editor.getByRole('button', { name: '保存设置' }).click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  await openWorkspaceSection(page, '习惯');
  await expect(page.getByTestId('habit-wake')).toContainText('12:00');
  await expect(page.getByTestId('habit-wake')).toContainText('06:50');
  await page.getByRole('button', { name: '习惯设置', exact: true }).click();
  await expect(editor.getByLabel('较晚起点', { exact: true })).toHaveValue('00:10');
  await expect(editor.getByLabel('较晚上限', { exact: true })).toHaveValue('00:40');
  await page.keyboard.press('Escape');
  const violations = (
    await new AxeBuilder({ page }).include('.habits-panel').analyze()
  ).violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''));
  expect(violations).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('habits.png'), fullPage: true });
  await openWorkspaceSection(page, '洞察');
  await expect(
    page.getByRole('heading', { name: '洞察', exact: true }).first(),
  ).toBeVisible();
});
