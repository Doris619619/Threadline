/** @fileoverview 从无登录的真实 Preview 入口验证演示交互、刷新持久化与云端隔离。 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
  await expect(daily.locator('textarea')).toHaveCount(0);
  await expect(daily.getByText('今日结果', { exact: true })).toHaveCount(0);
  await daily
    .getByRole('checkbox', { name: '完成 完成一道动态规划题并整理思路', exact: true })
    .check();
  await expect(
    daily.getByRole('checkbox', { name: '完成 Daily 算法训练' }),
  ).toBeChecked();
  await expect(page.locator('.daily-save-status:not(:empty)')).toHaveCount(0);
  await expect(
    page.locator('.daily-panel').getByRole('button', { name: /记录/ }),
  ).toHaveCount(0);

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
  await expect(daily.locator('textarea')).toHaveCount(0);
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
  for (const control of await daily
    .locator('.daily-check, input[type=number], button')
    .all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const parentCheck = (await daily
    .locator('.daily-parent .daily-check')
    .boundingBox())!;
  const childCheck = (await daily
    .locator('.daily-child-row .daily-check')
    .first()
    .boundingBox())!;
  expect(childCheck.x - parentCheck.x).toBeGreaterThanOrEqual(16);
  for (const name of await daily
    .locator('.daily-parent-title, .daily-child-name')
    .all()) {
    const overflow = await name.evaluate(
      (element) =>
        element.scrollWidth > element.clientWidth + 1 ||
        element.scrollHeight > element.clientHeight + 1,
    );
    expect(overflow).toBe(false);
  }
  const accessibility = await new AxeBuilder({ page })
    .include('.daily-panel')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await daily.screenshot({ path: info.outputPath('daily-group.png') });
  await page
    .locator('.daily-panel')
    .screenshot({ path: info.outputPath('daily-panel.png') });
  await page.screenshot({ path: info.outputPath('preview-demo.png'), fullPage: true });
});

/** 覆盖用户截图中的整页日程和收尾弹窗，检查原生日期输入在 iPhone 上的边界。 */
test('keeps scheduled metadata compact and close-day controls inside the viewport', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('.dashboard')).toBeVisible();
  const row = page.locator('.timeline-row').filter({ hasText: '领域论文' });
  if (info.project.name !== 'preview-desktop') {
    const parts = await row
      .locator('.timeline-time, .task-duration-planned, .task-duration-actual')
      .evaluateAll((elements) =>
        elements.map((el) => ({
          y: el.getBoundingClientRect().y,
          width: el.getBoundingClientRect().width,
        })),
      );
    expect(parts).toHaveLength(3);
    expect(
      Math.max(...parts.map((p) => p.y)) - Math.min(...parts.map((p) => p.y)),
    ).toBeLessThanOrEqual(2);
  }
  await page
    .locator('.schedule-panel')
    .screenshot({ path: info.outputPath('schedule.png') });
  await row.getByRole('checkbox').uncheck();
  const finish = page.getByRole('button', { name: '结束今天', exact: true });
  await finish.scrollIntoViewIfNeeded();
  await expect(finish).toBeVisible();
  await page.screenshot({ path: info.outputPath('home-bottom.png') });
  const dailyMinutes = page.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时');
  await dailyMinutes.fill('-1');
  await finish.click();
  await expect(
    page.getByRole('dialog', { name: '结束今天', exact: true }),
  ).not.toBeVisible();
  await expect(page.locator('.daily-save-error')).toBeVisible();
  await dailyMinutes.fill('8');
  await finish.click();
  const dialog = page.getByRole('dialog', { name: '结束今天', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[type=date]')).toHaveCount(0);
  const select = dialog.getByRole('combobox').first();
  await select.selectOption('date');
  const date = dialog.locator('input[type=date]');
  await expect(date).toBeVisible();
  const bounds = await dialog.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      vw: innerWidth,
      vh: innerHeight,
      overflow: el.scrollWidth > el.clientWidth + 1,
    };
  });
  expect(bounds.x).toBeGreaterThanOrEqual(15);
  expect(Math.abs(bounds.x * 2 + bounds.width - bounds.vw)).toBeLessThanOrEqual(2);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(bounds.vh + 1);
  expect(bounds.overflow).toBe(false);
  for (const control of await dialog.locator('input,select,button').all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    const font = await control.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    if (await control.evaluate((el) => el.matches('input,select')))
      expect(font).toBeGreaterThanOrEqual(16);
  }
  const footer = (await dialog.locator('footer').boundingBox())!;
  expect(footer.y + footer.height).toBeLessThanOrEqual(bounds.vh);
  expect(
    (await new AxeBuilder({ page }).include('.close-dialog').analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('close-day.png') });
  await dialog.getByRole('button', { name: '稍后处理', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(finish).toBeEnabled();
  await finish.click();
  await select.selectOption('tomorrow');
  await dialog.getByRole('button', { name: '确认结束今天', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: '今日已结束', exact: true }),
  ).toBeDisabled();
});
