/**
 * @fileoverview 通过真实本地 Supabase 验证登录、编辑失败重试、慢网勾选、双页面同步与持久化。
 */

import { expect, test } from '@playwright/test';
import { openWorkspaceSection } from './support/workspace';

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

test.describe('habits account timezone through real PostgREST', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('confirms both settings RPCs and shares China check-ins with another device', async ({
    page,
    browser,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '使用指定账号继续' }).click();
    await page.getByLabel('邮箱').fill(email);
    await page.locator('input#auth-password').fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '我的工作台' })).toBeVisible();
    await openWorkspaceSection(page, '习惯');
    await page.getByRole('button', { name: '习惯设置', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('账号时区', { exact: true }).selectOption('UTC');
    await dialog.getByRole('button', { name: '保存设置' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('habit-clock')).toContainText('协调世界时');

    const observerContext = await browser.newContext({
      storageState: await page.context().storageState(),
      timezoneId: 'Pacific/Honolulu',
      serviceWorkers: 'block',
    });
    try {
      const observer = await observerContext.newPage();
      await observer.goto(page.url());
      await openWorkspaceSection(observer, '习惯');
      await expect(observer.getByTestId('habit-clock')).toContainText('协调世界时');
      await openWorkspaceSection(page, '设置');
      await page.getByRole('button', { name: /日期与时区/ }).click();
      await page.getByLabel('账号时区', { exact: true }).selectOption('Asia/Shanghai');
      await page.getByRole('button', { name: '保存时区' }).click();
      await expect(page.getByRole('status')).toContainText('已保存');
      await expect(observer.getByTestId('habit-clock')).toContainText('北京时间');
      await openWorkspaceSection(page, '习惯');
      await page.getByRole('button', { name: '起床了', exact: true }).click();
      const recorded = page
        .getByTestId('habit-wake')
        .getByRole('button', { name: /编辑起床时间/ });
      await expect(recorded).toBeVisible();
      const value = (await recorded.innerText()).trim();
      await expect(observer.getByTestId('habit-wake')).toContainText(value);
      await page.reload();
      await openWorkspaceSection(page, '习惯');
      await expect(page.getByTestId('habit-clock')).toContainText('北京时间');
      await expect(page.getByTestId('habit-wake')).toContainText(value);
    } finally {
      await observerContext.close();
    }
  });
});

test('uses local Supabase Auth and persists a task through a real browser session', async ({
  page,
}) => {
  await page.goto('/');

  // 首屏在未登录时展示欢迎页，点击继续后进入登录表单
  await expect(
    page.getByRole('heading', { name: '欢迎回到 Threadline' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '使用指定账号继续' }).click();
  await expect(page.getByRole('heading', { name: '登录我的工作台' })).toBeVisible();
  await page.getByLabel('邮箱').fill(email);
  await page.locator('input#auth-password').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();

  await expect(page.getByRole('heading', { name: '我的工作台' })).toBeVisible();
  await page.getByRole('button', { name: '项目', exact: true }).click();
  await expect(page.locator('.project-panel')).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: '项目', exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole('button', { name: '新建', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '首页', exact: true }).click();
  const waitingPanel = page.locator('.waiting-panel');
  await waitingPanel.getByRole('button', { name: '添加普通事项', exact: true }).click();
  await waitingPanel.getByPlaceholder('事项内容').fill(taskTitle);
  await waitingPanel.getByTitle('保存待办').click();
  await expect(waitingPanel.getByText(taskTitle, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: '我的工作台' })).toBeVisible();
  await expect(
    page.locator('.waiting-panel').getByText(taskTitle, { exact: true }),
  ).toBeVisible();

  // 真实首页编辑遇到服务端写入失败时保留草稿，重试成功后才关闭并持久化。
  await page.locator('.waiting-task-main').filter({ hasText: taskTitle }).click();
  const editor = page.getByRole('dialog', { name: '修改待安排事项' });
  await editor.getByRole('textbox', { name: '任务名称' }).fill(`${taskTitle} edited`);
  await page.route('**/rest/v1/tasks*', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: '编辑保存回归：服务暂时不可用' }),
      });
    } else {
      await route.continue();
    }
  });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('服务暂时不可用');
  await expect(editor.getByRole('textbox', { name: '任务名称' })).toHaveValue(
    `${taskTitle} edited`,
  );
  await page.unroute('**/rest/v1/tasks*');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await expect(
    page.locator('.waiting-panel').getByText(`${taskTitle} edited`, { exact: true }),
  ).toBeVisible();

  // 实际 REST 请求暂缓发往数据库，确保首次勾选在响应前就稳定，而不是重试三次才显示。
  const schedule = page.locator('.schedule-panel');
  await schedule.getByRole('button', { name: '添加', exact: true }).click();
  await schedule.getByPlaceholder('任务名称（按 Enter 保存）').fill('首次勾选云端回归');
  await schedule.getByTitle('保存任务').click();
  const row = schedule.locator('.timeline-row').filter({ hasText: '首次勾选云端回归' });
  await expect(row).toBeVisible();
  const observer = await page.context().newPage();
  await observer.goto('/');
  const observerCheck = observer
    .locator('.schedule-panel .timeline-row')
    .filter({ hasText: '首次勾选云端回归' })
    .getByRole('checkbox');
  await expect(observerCheck).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseWrite!: () => void;
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  let intercepted!: () => void;
  const interceptedWrite = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  await page.route('**/rest/v1/tasks*', async (route) => {
    if (route.request().method() === 'POST') {
      intercepted();
      await writeGate;
    }
    await route.continue();
  });
  const checked = row.getByRole('checkbox');
  try {
    await checked.click();
    await interceptedWrite;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    expect(await checked.isChecked()).toBe(true);
    expect(await observerCheck.isChecked()).toBe(false);
  } finally {
    releaseWrite();
  }
  await expect(observerCheck).toBeChecked();
  await page.reload();
  await expect(checked).toBeChecked();
  await observer.close();
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByTestId('settings-panel')
    .getByRole('button', { name: /^隐私/ })
    .click();
  await expect(page.getByRole('heading', { name: '隐私', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '欢迎回到 Threadline' }),
  ).toBeVisible();
});
