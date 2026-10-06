/** @fileoverview 阶段真实用户路径：连续清单、同一任务流转、隐藏撤销、历史和删除保留任务。 */
import { expect, test, type Page } from '@playwright/test';
import type { Task } from '@/types/domain';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
  openTaskMenu,
} from './support/workspace';

import { createStage } from './support/stage-plans';

/** 读取适配器持久化真源，用 ID 与记录数证明没有复制任务。 */
async function storedTasks(page: Page): Promise<Task[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('threadline.tasks.v1')!));
}

test('keeps all 16 tasks while scheduling, moving dates, completing, hiding and undoing', async ({
  page,
}, info) => {
  await bootstrapLocalAdapterWorkspace(page, 'stages.' + info.testId);
  await openWorkspaceSection(page, '计划');
  const plan = await createStage(page, '冲刺');
  const original = await storedTasks(page);
  const member = original.find((task) => task.title === '冲刺任务1')!;
  const taskCount = original.length;
  await openWorkspaceSection(page, '首页');
  const stage = page.locator('[data-stage-id="' + plan.id + '"]');
  await expect(stage.locator('.stage-task-row')).toHaveCount(16);
  await expect(page.locator('.waiting-panel')).not.toContainText('冲刺任务1');
  await page.getByLabel('工作区日期', { exact: true }).fill('2026-08-25');
  await stage
    .getByRole('region', { name: '未安排', exact: true })
    .locator('[data-stage-task-id="' + member.id + '"]')
    .getByRole('button', { name: '→ 今天' })
    .click();
  await expect(page.getByLabel('工作区日期', { exact: true })).toHaveValue(
    '2026-08-23',
  );
  const row = stage.locator('[data-stage-task-id="' + member.id + '"]');
  await expect(
    stage
      .getByRole('region', { name: '已安排', exact: true })
      .locator('[data-stage-task-id]'),
  ).toHaveCount(1);
  await expect(row.locator('time')).toHaveText('今天');
  await expect(page.locator('.schedule-panel')).toContainText('冲刺任务1');
  await openTaskMenu(
    row.getByRole('button', {
      name: '冲刺任务1更多操作',
      exact: true,
      includeHidden: true,
    }),
  );
  await page.getByRole('menuitem', { name: '安排到其他日期', exact: true }).click();
  await page.getByLabel('移期日期').fill('2026-08-25');
  await page.getByRole('button', { name: '确认改期', exact: true }).click();
  await expect(row.locator('time')).toHaveText('8月25日');
  await expect(page.locator('.schedule-panel')).not.toContainText('冲刺任务1');
  await row.getByRole('checkbox').click();
  await expect(
    stage.getByRole('region', { name: '已完成', exact: true }).getByRole('checkbox'),
  ).toBeChecked();
  await stage
    .getByRole('region', { name: '已完成', exact: true })
    .getByRole('checkbox')
    .click();
  await expect(
    stage
      .getByRole('region', { name: '已安排', exact: true })
      .locator('[data-stage-task-id]'),
  ).toHaveCount(1);
  const after = await storedTasks(page);
  expect(after.length).toBe(taskCount);
  expect(
    after
      .filter((task) => task.stagePlanId === plan.id)
      .map((task) => task.id)
      .sort(),
  ).toEqual(
    original
      .filter((task) => task.stagePlanId === plan.id)
      .map((task) => task.id)
      .sort(),
  );
  await stage.getByRole('button', { name: '从首页隐藏', exact: true }).click();
  await expect(stage).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(stage.locator('.stage-task-row')).toHaveCount(16);
  await stage.getByRole('button', { name: '从首页隐藏', exact: true }).click();
  await openWorkspaceSection(page, '计划');
  await page
    .locator('.stage-plan-card')
    .getByRole('button', { name: '显示在首页', exact: true })
    .click();
  await page.getByRole('button', { name: '查看阶段 冲刺', exact: true }).click();
  await expect(
    page
      .getByTestId('stage-detail')
      .locator('.stage-task-row')
      .filter({ visible: true }),
  ).toHaveCount(16);
  await page.getByRole('button', { name: '删除阶段', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('所有任务都会保留');
  await page.getByRole('button', { name: '删除阶段，保留任务', exact: true }).click();
  await expect(page.getByTestId('stage-detail')).toHaveCount(0);
  const detached = await storedTasks(page);
  expect(detached.length).toBe(taskCount);
  expect(detached.find((task) => task.id === member.id)?.date).toBe('2026-08-25');
  expect(detached.some((task) => task.stagePlanId === plan.id)).toBe(false);
  await openWorkspaceSection(page, '首页');
  await expect(page.locator('.waiting-panel')).toContainText('冲刺任务16');
});

test('shows every pinned future stage and expires at account midnight while retaining past detail', async ({
  page,
}, info) => {
  await bootstrapLocalAdapterWorkspace(page, 'expiry.' + info.testId);
  await openWorkspaceSection(page, '计划');
  const plan = await createStage(page, '今天结束', 1, '2026-08-22', '2026-08-23');
  await createStage(page, '即将开始', 7, '2026-08-25', '2026-08-28');
  await openWorkspaceSection(page, '首页');
  await expect(page.locator('.home-stage-card')).toHaveCount(2);
  await expect(
    page.locator('.home-stage-card').filter({ hasText: '即将开始' }),
  ).toContainText('2 天后开始');
  await page.clock.setFixedTime(new Date('2026-08-24T00:00:01+08:00'));
  await page.clock.runFor(61_000);
  await expect(page.locator('.home-stage-card')).toHaveCount(1);
  await openWorkspaceSection(page, '计划');
  await page.getByRole('tab', { name: /^过去/ }).click();
  await page.getByLabel('搜索计划', { exact: true }).fill('今天结束');
  await page.getByRole('button', { name: '查看阶段 今天结束', exact: true }).click();
  await expect(page.getByTestId('stage-detail')).toContainText('已结束');
  await page.getByLabel('添加阶段任务').fill('历史也能追加');
  await page.getByLabel('添加阶段任务').press('Enter');
  await expect(page.getByLabel('添加阶段任务')).toBeFocused();
  await expect(
    page
      .getByTestId('stage-detail')
      .locator('.stage-task-row')
      .filter({ visible: true }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: '返回计划', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^过去/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('搜索计划', { exact: true })).toHaveValue('今天结束');
  await expect(page.locator('[data-stage-card-id="' + plan.id + '"]')).toBeFocused();
});
