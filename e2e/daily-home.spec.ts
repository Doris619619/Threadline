/** @fileoverview 验证首页全部 Daily 信息、逐项记录和重要/普通添加编辑的完整浏览器流程。 */

import { expect, test } from '@playwright/test';
import { bootstrapLocalAdapterWorkspace } from './support/workspace';

test.beforeEach(async ({ page }, info) => {
  await bootstrapLocalAdapterWorkspace(page, 'threadline.daily-home.' + info.testId);
});

test('creates in both waiting groups and moves the same task by editing importance', async ({
  page,
}) => {
  const important = page.getByRole('region', { name: '重要待安排', exact: true });
  const normal = page.getByRole('region', { name: '普通待安排', exact: true });
  await expect(important).toBeVisible();
  await expect(normal).toBeVisible();
  await important.getByRole('button', { name: '添加重要事项' }).click();
  await page.getByLabel('重要事项内容').fill('提交科研材料');
  await important.getByTitle('保存待办').click();
  const created = important
    .locator('.waiting-task-row')
    .filter({ hasText: '提交科研材料' });
  await expect(created).toBeVisible();
  await created.locator('.waiting-task-main').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('重要性').selectOption('normal');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(important.getByText('提交科研材料', { exact: true })).toHaveCount(0);
  await expect(normal.getByText('提交科研材料', { exact: true })).toBeVisible();
  await normal.getByRole('button', { name: '添加普通事项' }).click();
  await page.getByLabel('普通事项内容').fill('整理笔记');
  await normal.getByTitle('保存待办').click();
  await page.reload();
  await expect(normal.getByText('整理笔记', { exact: true })).toBeVisible();
  await expect(normal.getByText('提交科研材料', { exact: true })).toBeVisible();
});

test('records child minutes without a result form and keeps next date fresh', async ({
  page,
}) => {
  const group = page.getByRole('region', { name: 'Daily 背单词', exact: true });
  await expect(group.getByText('新词', { exact: true })).toBeVisible();
  await group.getByLabel('背单词 新词实际耗时').fill('18');
  await expect(group.locator('textarea')).toHaveCount(0);
  await group.getByRole('checkbox', { name: '完成 新词' }).check();
  await expect(
    group.getByRole('checkbox', { name: '完成 Daily 背单词' }),
  ).toBeChecked();
  await group.getByRole('button', { name: '记录', exact: true }).click();
  await expect(group.getByRole('button', { name: '已记录' })).toBeDisabled();
  await page.reload();
  await expect(group.getByLabel('背单词 新词实际耗时')).toHaveValue('18');
  await expect(group.locator('textarea')).toHaveCount(0);
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(
    group.getByRole('checkbox', { name: '完成 Daily 背单词' }),
  ).not.toBeChecked();
  await expect(group.getByLabel('背单词 新词实际耗时')).toHaveValue('');
});
