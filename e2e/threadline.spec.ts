import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { name: '我的工作台' }).waitFor();
  await page.waitForTimeout(250);
});

test('creates a timed task with keyboard-friendly time input', async ({ page }) => {
  await page
    .locator('.quick-panel')
    .getByRole('button', { name: '添加', exact: true })
    .click();
  await page.getByLabel('任务名称').fill('整理研究笔记');
  await page.getByLabel('开始时间').fill('1420');
  await page.getByLabel('结束时间').fill('1530');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '整理研究笔记', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.timeline-row').filter({ hasText: '整理研究笔记' }),
  ).toContainText('1h10min');
});

test('creates an unscheduled task and stores manual actual minutes', async ({
  page,
}) => {
  await page
    .locator('.quick-panel')
    .getByRole('button', { name: '添加', exact: true })
    .click();
  await page.getByLabel('任务名称').fill('订购实验耗材');
  await page.getByLabel('实际时长（分钟）').fill('25');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const row = page.locator('.quick-task-row').filter({ hasText: '订购实验耗材' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '订购实验耗材', exact: true }).click();
  await expect(page.getByLabel('实际时长（分钟）')).toHaveValue('25');
});

test('formats actual minutes on a timed task', async ({ page }) => {
  await page
    .locator('.quick-panel')
    .getByRole('button', { name: '添加', exact: true })
    .click();
  await page.getByLabel('任务名称').fill('标注访谈记录');
  await page.getByLabel('开始时间').fill('1200');
  await page.getByLabel('结束时间').fill('1330');
  await page.getByLabel('实际时长（分钟）').fill('90');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(
    page.locator('.timeline-row').filter({ hasText: '标注访谈记录' }),
  ).toContainText('实际1h30min');
});

test('completion can be toggled without a dialog', async ({ page }) => {
  const task = page.getByRole('checkbox', { name: '完成邮件处理' });
  await task.check();
  await expect(task).toBeChecked();
  await task.uncheck();
  await expect(task).not.toBeChecked();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('persists task changes and navigates across dates', async ({ page }) => {
  const task = page.getByRole('checkbox', { name: '完成邮件处理' });
  await task.check();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '完成邮件处理' })).toBeChecked();
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(page.getByText('2026-08-24　周一')).toBeVisible();
  await expect(page.getByText('还没有待安排事项。')).toBeVisible();
  await page.getByRole('button', { name: '前一天' }).click();
  await expect(page.getByRole('checkbox', { name: '完成邮件处理' })).toBeChecked();
});

test('creates a fresh Daily instance for another date', async ({ page }) => {
  await expect(
    page.getByRole('checkbox', { name: '完成 Daily 听力训练' }),
  ).toBeChecked();
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(
    page.getByRole('checkbox', { name: '完成 Daily 听力训练' }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: '完成 新词' }).check();
  await page.getByRole('button', { name: '前一天' }).click();
  await expect(
    page.getByRole('checkbox', { name: '完成 Daily 背单词' }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(page.getByRole('checkbox', { name: '完成 Daily 背单词' })).toBeChecked();
});

test('creates a Daily definition that appears on following dates', async ({ page }) => {
  await page.getByLabel('新 Daily 名称').fill('晚间复盘');
  await page.getByRole('button', { name: /添加 Daily/ }).click();
  await expect(page.getByText('晚间复盘', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(page.getByText('晚间复盘', { exact: true })).toBeVisible();
});

test('moves an item through planning and returns it to today', async ({ page }) => {
  await page.getByRole('button', { name: '邮件处理更多操作' }).click();
  await page.getByRole('button', { name: '待安排', exact: true }).click();
  await expect(page.getByLabel('邮件处理 DDL')).toBeVisible();
  await page.getByLabel('邮件处理 DDL').fill('2026-08-28T23:59');
  await page.getByRole('button', { name: '安排到今天', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '完成邮件处理' })).toBeVisible();
});

test('daily subtask completion completes its parent', async ({ page }) => {
  const child = page.getByRole('checkbox', { name: '完成 新词' });
  await child.check();
  await expect(page.getByRole('checkbox', { name: '完成 Daily 背单词' })).toBeChecked();
});

test('records rescheduling and abandonment in history', async ({ page }) => {
  const pickup = page.locator('.quick-task-row').filter({ hasText: '取快递' });
  await pickup.getByRole('button', { name: '取快递更多操作' }).click();
  await pickup.getByRole('button', { name: '放弃', exact: true }).click();

  const email = page.locator('.timeline-row').filter({ hasText: '邮件处理' });
  await email.getByRole('button', { name: '邮件处理更多操作' }).click();
  await email.getByRole('button', { name: '移期', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('cell', { name: '已移期' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '放弃' })).toBeVisible();
});

test('deletes a task and restores it from trash', async ({ page }) => {
  const pickup = page.locator('.quick-task-row').filter({ hasText: '取快递' });
  await pickup.getByRole('button', { name: '取快递更多操作' }).click();
  await pickup.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByText('取快递', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await expect(page.getByText('回收站为空。')).toBeVisible();
});

test('purges trash entries older than thirty days on reload', async ({ page }) => {
  await page.evaluate(() => {
    const tasks = JSON.parse(
      window.localStorage.getItem('threadline.tasks.v1') ?? '[]',
    );
    tasks.push({
      id: 'expired-task',
      projectId: 'other',
      title: '过期删除任务',
      completed: false,
      status: 'trashed',
      deletedAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    window.localStorage.setItem('threadline.tasks.v1', JSON.stringify(tasks));
  });
  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByText('过期删除任务')).toHaveCount(0);
});

test('closes today and moves unfinished work into planning', async ({ page }) => {
  await page.getByRole('button', { name: '结束今天', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('select').first().selectOption('backlog');
  await dialog.getByRole('button', { name: '确认结束今天', exact: true }).click();
  const planning = page.locator('.planning-queue');
  await expect(planning).toContainText('邮件处理');
  await expect(planning.getByLabel('邮件处理 DDL')).toBeVisible();
});

test('shows task and daily data in weekly review', async ({ page }) => {
  await page.getByRole('button', { name: '复盘', exact: true }).click();
  await expect(page.getByRole('heading', { name: '周复盘' })).toBeVisible();
  await expect(page.getByText('普通与 Daily 实际耗时')).toBeVisible();
  await expect(page.getByText('1/3 已完成 · 30min')).toBeVisible();
  await page.getByRole('button', { name: '月', exact: true }).click();
  await expect(page.getByRole('heading', { name: '月复盘' })).toBeVisible();
});

test('edits a project and opens its compact project detail', async ({ page }) => {
  await page.getByRole('button', { name: '项目', exact: true }).click();
  await page.getByRole('button', { name: '【AI研究】' }).click();
  await expect(
    page.getByRole('heading', { name: 'AI研究', exact: true }),
  ).toBeVisible();
  const researchRow = page.locator('.project-row').filter({ hasText: 'AI研究' });
  await researchRow.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('AI研究项目名称').fill('AI 实验室');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('【AI 实验室】')).toBeVisible();
});
