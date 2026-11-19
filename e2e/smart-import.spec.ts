/** @fileoverview 验证真实首页导入入口、文本保留、解析不可用提示和移动弹窗边界，不调用收费解析。 */

import { expect, test } from '@playwright/test';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';

test('opens smart import from the schedule and preserves text when parsing is unavailable', async ({
  page,
}) => {
  // 同时支持生产演示和 localhost 开发服务；后者显式失败，避免自动化调用真实收费模型。
  await page.route('**/api/local-smart-import', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: '本地解析服务暂时不可用，请重试。' }),
    }),
  );
  await bootstrapLocalAdapterWorkspace(page, 'smart-import-entry');
  const trigger = page.getByRole('button', { name: '智能导入', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '智能导入任务' });
  const source = dialog.getByLabel('待解析内容');
  await expect(source).toBeFocused();
  const text = '嗯，今天要做 ECE4016 作业，大概花 90 分钟。然后看 Lecture 6。';
  await source.fill(text);
  await dialog.getByRole('button', { name: '开始解析', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    /智能解析需要登录云工作区|本地解析服务暂时不可用/,
  );
  await expect(source).toHaveValue(text);
  await expect(dialog.locator('input[type="date"]')).toHaveCount(0);
  expect(
    await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('allows escape to dismiss the input dialog without saving a task', async ({
  page,
}) => {
  await bootstrapLocalAdapterWorkspace(page, 'smart-import-dismiss');
  const before = await page.locator('.timeline-row').count();
  await page.getByRole('button', { name: '智能导入', exact: true }).click();
  await page.getByLabel('待解析内容').fill('需要完成作业，但尚未确认导入');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.locator('.timeline-row').count()).toBe(before);
});

test('exposes the API connection option in settings without storing credentials in demo mode', async ({
  page,
}) => {
  await bootstrapLocalAdapterWorkspace(page, 'smart-import-api-settings');
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: /AI \/ API 接入/ }).click();
  await expect(
    page.getByRole('heading', { name: 'AI / API 接入', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('请登录 Cloud 工作区后设置个人 API Key，演示模式暂不支持。'),
  ).toBeVisible();
  await expect(page.locator('#deepseek-api-key')).toHaveCount(0);
});
