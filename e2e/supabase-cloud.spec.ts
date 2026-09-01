/**
 * @fileoverview 通过真实本地 Supabase 验证浏览器登录、工作区初始化、任务持久化与退出登录。
 */

import { expect, test } from '@playwright/test';

/** 读取 runner 注入的一次性凭据；缺失时明确指出应通过专用 runner 启动。 */
function readRequiredTestEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(
      `${name} is required; run this suite through scripts/test-supabase-browser.mjs.`,
    );
  return value;
}

const email = readRequiredTestEnvironment('THREADLINE_SUPABASE_E2E_EMAIL');
const password = readRequiredTestEnvironment('THREADLINE_SUPABASE_E2E_PASSWORD');
const taskTitle = 'Supabase browser persistence probe';

test('uses local Supabase Auth and persists a task through a real browser session', async ({
  page,
}) => {
  await page.goto('/');

  // 首屏必须是 Auth gate，证明此 suite 没有走 local test adapter。
  await expect(page.getByRole('heading', { name: '登录我的工作台' })).toBeVisible();
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();

  await expect(page.getByRole('heading', { name: '我的工作台' })).toBeVisible();
  await page.getByRole('button', { name: '项目', exact: true }).click();
  await expect(page.locator('.project-panel')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '【工作】', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: '首页', exact: true }).click();
  const quickPanel = page.locator('.quick-panel');
  await quickPanel.getByRole('button', { name: '添加', exact: true }).click();
  await quickPanel.getByPlaceholder('待办内容（按 Enter 保存）').fill(taskTitle);
  await quickPanel.getByTitle('保存待办').click();
  await expect(quickPanel.getByText(taskTitle, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: '我的工作台' })).toBeVisible();
  await expect(
    page.locator('.quick-panel').getByText(taskTitle, { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByTestId('settings-panel')
    .getByRole('button', { name: /^隐私/ })
    .click();
  await expect(page.getByRole('heading', { name: '隐私', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '登录我的工作台' })).toBeVisible();
});
