/** @fileoverview 通过计划表单创建阶段的浏览器验证共享入口。 */
import { expect, type Page } from '@playwright/test';
import type { StagePlan } from '@/types/domain';

/** 通过真实表单创建阶段；手机先进入清单步骤，任务不填写日程时间。 */
export async function createStage(
  page: Page,
  name: string,
  count = 16,
  start = '2026-08-23',
  end = '2026-08-30',
) {
  await page.getByRole('button', { name: '+ 新建阶段', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建阶段', exact: true });
  await dialog.getByLabel('阶段名称', { exact: true }).fill(name);
  await dialog.getByLabel('阶段开始日期').fill(start);
  await dialog.getByLabel('阶段结束日期').fill(end);
  const next = dialog.getByRole('button', { name: '下一步', exact: true });
  if (await next.isVisible()) await next.click();
  for (let i = 1; i <= count; i++) {
    await dialog.getByLabel('阶段任务名称', { exact: true }).fill(name + '任务' + i);
    await dialog.getByLabel('阶段任务名称', { exact: true }).press('Enter');
  }
  await dialog.getByRole('button', { name: '创建阶段', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  return page.evaluate(
    (title) =>
      JSON.parse(localStorage.getItem('threadline.stage-plans.v1')!).find(
        (plan: StagePlan) => plan.name === title,
      ) as StagePlan,
    name,
  );
}
