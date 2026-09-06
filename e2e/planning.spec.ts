/** @fileoverview 通过真实规划界面验证跨日创建、提前改期、安排与首页日期隔离。 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';

test.beforeEach(async ({ page }, info) => {
  await bootstrapLocalAdapterWorkspace(page, `planning.${info.testId}`);
  await openWorkspaceSection(page, '规划');
});

test('creates next week work, brings it forward, completes it and keeps home on today', async ({
  page,
}) => {
  await page.getByRole('button', { name: /^2026-08-23，/ }).click();
  await page.getByRole('button', { name: '下一周', exact: true }).click();
  await page.getByRole('button', { name: '添加任务', exact: true }).first().click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('textbox', { name: '任务名称' }).fill('下周研究安排');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  let row = page.locator('.planning-task').filter({ hasText: '下周研究安排' });
  await expect(row).toBeVisible();
  await row.getByLabel('下周研究安排更多操作').click();
  await row.getByRole('button', { name: '改期', exact: true }).click();
  await page.getByLabel('移期日期').fill('2026-08-24');
  await page.getByRole('button', { name: '确认改期' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await page
    .locator('.planning-week')
    .getByRole('button', { name: /^2026-08-24，/ })
    .click();
  row = page.locator('.planning-task').filter({ hasText: '下周研究安排' });
  await row.getByRole('checkbox').click();
  await page.locator('.planning-completed > summary').click();
  await expect(row.getByRole('checkbox')).toBeChecked();
  await openWorkspaceSection(page, '首页');
  await expect(page.locator('.schedule-panel')).not.toContainText('下周研究安排');
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('threadline.tasks.v1') ?? '[]'),
  );
  expect(
    stored.find((item: { title: string }) => item.title === '下周研究安排'),
  ).toMatchObject({ date: '2026-08-24', completed: true, postponedFrom: '2026-08-30' });
});

test('selects a month date, schedules waiting work and preserves task counts on completion', async ({
  page,
}, info) => {
  const month = page.getByRole('region', { name: '月份选日' });
  await month.getByRole('button', { name: /^2026-08-25，/ }).click();
  await expect(month).toHaveCount(0);
  await page.locator('.planning-waiting > summary').click();
  const row = page
    .locator('.planning-waiting .planning-task')
    .filter({ hasText: '取快递' });
  await row.getByRole('button', { name: '安排到 8/25' }).click();
  await expect(row).toHaveCount(0);
  await expect(
    page.locator('.planning-agenda .planning-task').filter({ hasText: '取快递' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const report = await new AxeBuilder({ page }).analyze();
  expect(
    report.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('planning.png'), fullPage: true });
  const scheduled = page
    .locator('.planning-agenda .planning-task')
    .filter({ hasText: '取快递' });
  await scheduled.getByRole('checkbox').click();
  await page.getByRole('button', { name: '返回月历' }).click();
  await expect(
    page.getByRole('button', { name: /^2026-08-25，1 项任务/ }),
  ).toBeFocused();
  await expect(
    page.locator('[data-date="2026-08-25"] .planning-date-count'),
  ).toHaveText('1 项');
});

/** 以真实任务结构生成整月演示数据，不访问生产账号；同时覆盖双位数与已完成项。 */
async function fillMonth(page: Page) {
  await page.evaluate(() => {
    const tasks = JSON.parse(localStorage.getItem('threadline.tasks.v1') ?? '[]');
    const source = tasks.find((task: { status: string }) => task.status === 'active');
    const counts = [
      2, 5, 1, 0, 8, 3, 4, 6, 2, 1, 7, 12, 0, 3, 2, 5, 9, 4, 2, 6, 1, 3, 8, 4, 0, 2, 5,
      7, 1, 3, 6,
    ];
    const titles = [
      '阅读本周论文',
      '整理研究笔记',
      '与导师讨论',
      '准备项目报告',
      '运动',
      '处理邮件',
      '复习课程',
      '更新研究进展',
      '采购日用品',
      '整理参考资料',
      '确认会议时间',
      '备份文档',
    ];
    const scheduled = counts.flatMap((count, index) =>
      Array.from({ length: count }, (_, n) => ({
        ...source,
        id: 'planning-demo-' + index + '-' + n,
        title: titles[n],
        date: '2026-08-' + String(index + 1).padStart(2, '0'),
        completed: n === 7,
        completedAt: n === 7 ? '2026-08-23T04:00:00Z' : undefined,
        plannedStartTime: n < 3 ? ['09:00', '11:00', '14:00'][n] : undefined,
        plannedEndTime: undefined,
        plannedDurationMinutes: n < 3 ? 30 : undefined,
        actualDurationMinutes: undefined,
      })),
    );
    localStorage.setItem(
      'threadline.tasks.v1',
      JSON.stringify([
        ...scheduled,
        ...tasks.filter((task: { status: string }) => task.status === 'waiting'),
      ]),
    );
  });
  await page.reload();
  await openWorkspaceSection(page, '规划');
}

/** 同时检查整页水平边界与 serious/critical 可访问性债务，包含实际热力文字对比。 */
async function checkAccessible(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  const report = await new AxeBuilder({ page }).analyze();
  expect(
    report.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
}

test('keeps month-first navigation, source month and keyboard focus', async ({
  page,
}, info) => {
  await expect(page.getByRole('region', { name: '月份选日' })).toBeVisible();
  await expect(page.getByRole('region', { name: '当天任务' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('month-sparse.png'), fullPage: true });
  await page.getByRole('button', { name: '上个月', exact: true }).click();
  await page.getByRole('button', { name: /^2026-08-01，/ }).click();
  await expect(
    page.getByRole('heading', { name: '当天安排', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: '添加任务', exact: true })
    .first()
    .isDisabled()
    .then((value) => expect(value).toBe(true));
  await page.getByRole('button', { name: '下一周' }).click();
  await page.getByRole('button', { name: '返回月历' }).click();
  await expect(page.getByRole('heading', { name: '2026年7月' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^2026-08-01，/ })).toBeFocused();
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2026年8月' })).toBeVisible();
  await page.getByRole('button', { name: /待安排/ }).click();
  await expect(page.locator('.planning-waiting > summary')).toBeFocused();
  await expect(page.locator('.planning-waiting')).toHaveAttribute('open', '');
  await page.getByRole('button', { name: '返回月历' }).click();
  await expect(page.getByRole('button', { name: /待安排/ })).toBeFocused();
});

test('keeps dense heat readable in light and dark and displays the exact day tasks', async ({
  page,
}, info) => {
  await fillMonth(page);
  const count = page.locator('[data-date="2026-08-12"] .planning-date-count');
  await expect(count).toHaveText('12 项');
  await expect(
    page.locator('[data-date="2026-08-04"] .planning-date-count'),
  ).toHaveCount(0);
  const sizes = await count.evaluate((element) => ({
    count: parseFloat(getComputedStyle(element).fontSize),
    date: parseFloat(getComputedStyle(element.previousElementSibling!).fontSize),
  }));
  expect(sizes.count).toBeGreaterThanOrEqual(11);
  expect(sizes.count / sizes.date).toBeLessThan(0.7);
  await checkAccessible(page);
  await page.getByRole('button', { name: '下个月', exact: true }).click();
  await expect(page.locator('[data-date="2026-08-31"]')).toHaveAttribute(
    'data-outside',
    'true',
  );
  await checkAccessible(page);
  await page.getByRole('button', { name: '上个月', exact: true }).click();
  await page.screenshot({ path: info.outputPath('month-dense.png'), fullPage: true });
  if (info.project.name === 'planning-webkit') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath('month-pwa.png') });
    await page.setViewportSize({ width: 390, height: 664 });
  }
  await page.getByRole('button', { name: /^2026-08-23，8 项任务/ }).click();
  await expect(page.locator('.planning-day-heading')).toContainText('7 项待完成');
  await page.screenshot({ path: info.outputPath('day-dense.png'), fullPage: true });
  if (info.project.name === 'planning-webkit') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath('day-pwa.png') });
    await page.setViewportSize({ width: 390, height: 664 });
  }
  await page.getByRole('button', { name: '返回月历' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  // 等待实际外观过渡完成，避免 axe 把侧栏的中间插值颜色当成稳定深色样式。
  await page.evaluate(async () => {
    void document.documentElement.offsetWidth;
    await Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    );
  });
  await checkAccessible(page);
  await page.screenshot({ path: info.outputPath('month-dark.png'), fullPage: true });
  if (info.project.name === 'planning-webkit') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath('month-dark-pwa.png') });
    await page.setViewportSize({ width: 390, height: 664 });
  }
  await page.getByRole('button', { name: /^2026-08-23，8 项任务/ }).click();
  await checkAccessible(page);
  await page.screenshot({ path: info.outputPath('day-dark.png'), fullPage: true });
});

test('keeps the calendar usable with enlarged text and a narrow or landscape viewport', async ({
  page,
}, info) => {
  await fillMonth(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = '20px'));
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const target = await page.locator('[data-date="2026-08-30"]').boundingBox();
    expect(target!.width).toBeGreaterThanOrEqual(44);
    expect(target!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: /^2026-08-30，3 项任务/ }).click();
    await expect(
      page.getByRole('heading', { name: '当天安排', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '返回月历' }).click();
    await page.screenshot({
      path: info.outputPath('month-' + viewport.width + '.png'),
      fullPage: true,
    });
  }
});
