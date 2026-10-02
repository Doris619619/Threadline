/** @fileoverview 精修验收：真实项目菜单、阶段草稿、习惯卡片与月历对齐，保存可复核截图。 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
  reloadLocalAdapterWorkspace,
} from './support/workspace';
import { expectNoUnexpectedHorizontalOverflow } from './support/layout';

test('polished plans, popup keyboard and habit calendar remain usable across sizes', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await bootstrapLocalAdapterWorkspace(page, 'polish-' + info.testId);
  await page.evaluate(() => {
    localStorage.setItem(
      'threadline.appearance.v1',
      JSON.stringify({ theme: 'classic', colorMode: 'light', font: 'default' }),
    );
    const projects = JSON.parse(localStorage.getItem('threadline.projects.v1')!);
    for (const [index, name] of [
      '科研',
      '阅读',
      '语言练习',
      '长期课程与毕业设计材料准备',
    ].entries()) {
      projects.push({
        id: 'polish-' + index,
        name,
        color: ['#777cc9', '#75aa82', '#d4a253', '#ad83bb'][index],
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    }
    localStorage.setItem('threadline.projects.v1', JSON.stringify(projects));
  });
  await reloadLocalAdapterWorkspace(page);
  await openWorkspaceSection(page, '计划');
  await page.getByRole('button', { name: '+ 新建阶段', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建阶段', exact: true });
  await dialog.getByLabel('阶段名称', { exact: true }).fill('秋日学习计划');
  await dialog.getByLabel('阶段开始日期').fill('2026-08-23');
  await dialog.getByLabel('阶段结束日期').fill('2026-08-30');
  const next = dialog.getByRole('button', { name: '下一步', exact: true });
  if (await next.isVisible()) await next.click();
  const picker = dialog.getByRole('combobox', { name: '阶段任务项目', exact: true });
  await picker.click();
  const menu = page.locator('.project-picker-menu:popover-open');
  await expect(menu).toBeVisible();
  await expectNoUnexpectedHorizontalOverflow(page);
  const box = await menu.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({ path: info.outputPath('project-menu.png'), fullPage: false });
  expect(
    (
      await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
    ).violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
  ).toEqual([]);
  await expect(menu).toBeVisible();
  await expect(menu.locator('input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(picker).toBeFocused();
  await picker.press('ArrowDown');
  const search = menu.getByRole('combobox', { name: '搜索项目' });
  if (await search.isVisible()) await search.fill('科研');
  else await menu.getByRole('option', { name: '科研', exact: true }).click();
  if (await search.isVisible()) await search.press('Enter');
  await expect(picker).toContainText('科研');
  await picker.click();
  await page.keyboard.press('Tab');
  await expect(menu).not.toBeVisible();
  await expect(dialog).toBeVisible();
  const input = dialog.getByLabel('阶段任务名称', { exact: true });
  await input.fill('阅读论文并整理研究笔记');
  await input.press('Enter');
  await expect(
    dialog.getByRole('combobox', { name: '任务草稿 1 项目', exact: true }),
  ).toContainText('科研');
  await input.fill('完成课程练习');
  await input.press('Enter');
  await page.screenshot({ path: info.outputPath('stage-editor.png'), fullPage: false });
  await dialog.getByRole('button', { name: '创建阶段', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator('.stage-plan-card').filter({ hasText: '秋日学习计划' }),
  ).toBeVisible();
  await expectNoUnexpectedHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('plans-light.png'), fullPage: true });
  await openWorkspaceSection(page, '习惯');
  await page.getByRole('button', { name: '起床了', exact: true }).click();
  await page
    .getByLabel('当天工作效率', { exact: true })
    .getByRole('button', { name: '好', exact: true })
    .click();
  await page.getByRole('button', { name: '前一天记录' }).click();
  await page.getByRole('button', { name: '补录睡觉时间' }).click();
  await page.getByRole('dialog').getByLabel('睡觉时间', { exact: true }).fill('23:10');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await page
    .getByLabel('习惯统计范围')
    .getByRole('button', { name: '月', exact: true })
    .click();
  // August 2026 starts on Saturday: five empty cells precede day 1.
  await expect(
    page.locator('.habit-status-days > .habit-calendar-spacer').first(),
  ).toBeVisible();
  await expect(page.locator('.habit-status-days > button').first()).toHaveAttribute(
    'aria-label',
    /2026-08-01/,
  );
  for (const scheme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.colorScheme = value;
    }, scheme);
    await expectNoUnexpectedHorizontalOverflow(page);
    expect(
      (
        await new AxeBuilder({ page }).include('.habits-panel').analyze()
      ).violations.filter((item) =>
        ['serious', 'critical'].includes(item.impact ?? ''),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`habits-${scheme}.png`),
      fullPage: true,
    });
  }
});
