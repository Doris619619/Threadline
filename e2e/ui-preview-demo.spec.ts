/** @fileoverview 从无登录的真实 Preview 入口验证演示交互、刷新持久化与云端隔离。 */
import { expect, test } from '@playwright/test';

test('opens an interactive isolated demo and persists Daily and newly created tasks', async ({
  page,
}, info) => {
  const cloudRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (/supabase\.(co|in)|\/auth\/v1\/|\/rest\/v1\//.test(request.url()))
      cloudRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByLabel('演示模式说明')).toBeVisible();
  await expect(page.locator('.dashboard')).toBeVisible();
  const daily = page.getByRole('region', { name: 'Daily 算法训练', exact: true });
  await expect(
    daily.getByText('完成一道动态规划题并整理思路', { exact: true }),
  ).toBeVisible();
  await daily.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时').fill('18');
  await daily.getByLabel('算法训练今日结果').fill('完成练习并整理思路');
  await daily
    .getByRole('checkbox', { name: '完成 完成一道动态规划题并整理思路', exact: true })
    .check();
  await expect(
    daily.getByRole('checkbox', { name: '完成 Daily 算法训练' }),
  ).toBeChecked();
  await daily.getByRole('button', { name: '记录', exact: true }).click();
  await expect(daily.getByRole('button', { name: '已记录' })).toBeDisabled();

  const important = page.getByRole('region', { name: '重要待安排', exact: true });
  const normal = page.getByRole('region', { name: '普通待安排', exact: true });
  await expect(important.getByText('提交课程项目材料', { exact: true })).toBeVisible();
  await important.getByRole('button', { name: '添加重要事项' }).click();
  await page.getByLabel('重要事项内容').fill('演示：提交研究计划');
  await important.getByTitle('保存待办').click();
  const created = important
    .locator('.waiting-task-row')
    .filter({ hasText: '演示：提交研究计划' });
  await created.locator('.waiting-task-main').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('重要性').selectOption('normal');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(normal.getByText('演示：提交研究计划', { exact: true })).toBeVisible();

  const schedule = page.locator('.schedule-panel');
  await schedule.getByRole('button', { name: '添加', exact: true }).click();
  await schedule
    .getByPlaceholder('任务名称（按 Enter 保存）')
    .fill('演示：整理今日笔记');
  await schedule.getByTitle('保存任务').click();
  await expect(schedule.getByText('演示：整理今日笔记', { exact: true })).toBeVisible();
  await page.reload();
  await expect(daily.getByLabel('算法训练今日结果')).toHaveValue('完成练习并整理思路');
  await expect(
    daily.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时'),
  ).toHaveValue('18');
  await expect(normal.getByText('演示：提交研究计划', { exact: true })).toBeVisible();
  await expect(schedule.getByText('演示：整理今日笔记', { exact: true })).toBeVisible();
  await daily.getByRole('checkbox', { name: '完成 Daily 算法训练' }).uncheck();
  await expect(
    daily.getByRole('checkbox', {
      name: '完成 完成一道动态规划题并整理思路',
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    daily.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时'),
  ).toHaveValue('18');
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(
    daily.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时'),
  ).toHaveValue('');
  await page.getByRole('button', { name: '前一天' }).click();
  await expect(
    daily.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时'),
  ).toHaveValue('18');
  const storage = await page.evaluate(() => ({
    demo: localStorage.getItem('threadline.preview-demo.v1:threadline.tasks.v1'),
    legacy: localStorage.getItem('threadline.tasks.v1'),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
  expect(storage.demo).toContain('演示：整理今日笔记');
  expect(storage.legacy).toBeNull();
  expect(storage.overflow).toBe(false);
  expect(cloudRequests).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('preview-demo.png'), fullPage: true });
});
