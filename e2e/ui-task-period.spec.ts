/** @fileoverview 跨手机与桌面验收独立预计、生理期流程和稳定外观的可读性，并保留页面截图。 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';
import { expectNoUnexpectedHorizontalOverflow } from './support/layout';

test.beforeEach(async ({ page }, info) => {
  await bootstrapLocalAdapterWorkspace(page, `period-ui-${info.testId}`);
});

/** 用实际计算样式和 200% 根字号验证可读性；模拟文字放大不能替代真机 Dynamic Type 验收。 */
for (const [label, selector, image] of [
  ['首页', '.dashboard', 'home'],
  ['洞察', '.insights-panel', 'insights'],
  ['设置', '.settings-panel', 'settings'],
  ['节律', '.rhythm-panel', 'rhythm'],
]) {
  test(`system typography: ${image} remains readable at twice the text size`, async ({
    page,
  }, info) => {
    const mobile = (page.viewportSize()?.width ?? 1440) <= 760;
    const font = await page.locator('body').evaluate((el) => ({
      family: getComputedStyle(el).fontFamily,
      size: parseFloat(getComputedStyle(el).fontSize),
      weight: getComputedStyle(el).fontWeight,
    }));
    expect(font.family).toContain('-apple-system');
    expect(font.size).toBeGreaterThanOrEqual(mobile ? 17 : 15);
    expect(font.weight).toBe('400');
    await openWorkspaceSection(page, label);
    await expect(page.locator(selector)).toBeVisible();
    await expectNoUnexpectedHorizontalOverflow(page);
    expect(
      (await new AxeBuilder({ page }).include(selector).analyze()).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`${image}-typography.png`),
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    // 等待真实外观过渡结束，再检查最终配色；不关闭动画、不豁免对比度规则。
    await page.evaluate(async () => {
      void document.documentElement.offsetWidth;
      await Promise.allSettled(
        document.getAnimations().map((animation) => animation.finished),
      );
    });
    expect(
      (await new AxeBuilder({ page }).include(selector).analyze()).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`${image}-dark.png`),
      fullPage: true,
    });
    if (image === 'insights') {
      await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
      await expect(page.locator('.report-document')).toBeVisible();
      await expect(page.locator('body')).toHaveCSS(
        'background-color',
        'rgb(255, 255, 255)',
      );
      await expect(page.locator('.report-document')).toHaveCSS(
        'color',
        'rgb(17, 17, 17)',
      );
      await page.emulateMedia({ media: 'screen' });
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await expectNoUnexpectedHorizontalOverflow(page);
    await page.screenshot({
      path: info.outputPath(`${image}-large-text.png`),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('font-size');
    });
  });
}

test('waiting creation gives estimates usable width in narrow columns', async ({
  page,
}, info) => {
  await page.evaluate(async () => {
    document.documentElement.dataset.theme = 'anya';
    document.documentElement.dataset.font = 'source-han-serif';
    await document.fonts.ready;
  });
  const waiting = page.locator('.waiting-panel');
  await waiting.getByRole('button', { name: '添加普通事项', exact: true }).click();
  const form = waiting.locator('.quick-task-create-row');
  const estimate = form.getByLabel('预计时长（分钟）');
  const title = form.getByLabel('普通事项内容');
  // 新增行有进入动画；等待结束，避免跨帧读取把整体位移误报为控件错位。
  await form.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  const desktop = (page.viewportSize()?.width ?? 0) > 760;
  for (const width of desktop ? [260, 300, 360] : [null]) {
    if (width)
      await waiting.evaluate((element, width) => {
        element.style.width = `${width}px`;
      }, width);
    // 所有坐标在同一次布局读取中获取，保留严格对齐阈值。
    const { field, label, actions, titleBox } = await form.evaluate((element) => {
      /** 同步读取控件矩形；缺少字段时立即失败，不能跳过布局断言。 */
      const rect = (selector: string) => {
        const target = element.querySelector(selector);
        if (!target) throw new Error(`新增表单缺少 ${selector}`);
        return target.getBoundingClientRect().toJSON();
      };
      return {
        field: rect('.estimate-field input'),
        label: rect('.estimate-field label > span'),
        actions: rect('.quick-create-actions'),
        titleBox: rect('.quick-create-title'),
      };
    });
    expect(field!.width).toBeGreaterThanOrEqual(desktop ? 64 : 100);
    expect(label!.height).toBeLessThan(30);
    expect(actions!.x).toBeGreaterThanOrEqual(field!.x + field!.width);
    expect(actions!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
    expect(
      Math.abs(actions!.y + actions!.height - field!.y - field!.height),
    ).toBeLessThan(2);
    expect(
      Math.abs(titleBox!.x + titleBox!.width - actions!.x - actions!.width),
    ).toBeLessThan(2);
    if (desktop) {
      expect(
        Math.abs(label!.y + label!.height / 2 - field!.y - field!.height / 2),
      ).toBeLessThan(2);
      expect((await form.boundingBox())!.height).toBeLessThan(100);
    }
    await expectNoUnexpectedHorizontalOverflow(page);
  }
  await title.fill('窄栏新增预计测试');
  await estimate.fill('90');
  await page.screenshot({
    path: info.outputPath('waiting-create.png'),
    fullPage: true,
  });
  await form.screenshot({ path: info.outputPath('waiting-create-detail.png') });
  await form.getByTitle('保存待办').click();
  await expect(
    waiting.locator('.waiting-task-row').filter({ hasText: '窄栏新增预计测试' }),
  ).toContainText('1h30min');
});

test('independent estimates persist through schedule and waiting; compact pages stay readable', async ({
  page,
}, info) => {
  const schedule = page.locator('.schedule-panel');
  await schedule.getByRole('button', { name: '添加', exact: true }).click();
  const form = schedule.locator('.timed-task-create-row');
  await form.getByPlaceholder('任务名称（按 Enter 保存）').fill('只有预计的任务');
  await form.getByLabel('预计时长（分钟）').fill('90');
  await form.getByTitle('保存任务').click();
  const row = schedule.locator('.timeline-row').filter({ hasText: '只有预计的任务' });
  await expect(row).toContainText('1h30min');
  await row.getByRole('button', { name: '只有预计的任务更多操作' }).click();
  await page.getByRole('button', { name: '待安排', exact: true }).click();
  const waiting = page
    .locator('.waiting-task-row')
    .filter({ hasText: '只有预计的任务' });
  await expect(waiting).toContainText('1h30min');
  await waiting.getByRole('button', { name: '只有预计的任务更多操作' }).click();
  await page.getByRole('menuitem', { name: '安排到今天' }).click();
  await expect(row).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row).toContainText('1h30min');
  await page.reload();
  await expect(row).toContainText('1h30min');
  await expectNoUnexpectedHorizontalOverflow(page);
  await info.attach('schedule-row-metrics', {
    body: JSON.stringify(await row.boundingBox()),
    contentType: 'application/json',
  });
  if (
    (page.viewportSize()?.width ?? 1440) >= 375 &&
    (page.viewportSize()?.width ?? 1440) <= 430
  ) {
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(96);
  }
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  for (const label of ['洞察', '设置']) {
    await openWorkspaceSection(page, label);
    await expectNoUnexpectedHorizontalOverflow(page);
    if (label === '设置')
      await expect(page.getByLabel('选择日期', { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(label === '洞察' ? 'insights.png' : 'settings.png'),
      fullPage: true,
    });
  }
});

test('period start, end, backfill, edit, delete and offline retry use real form state', async ({
  page,
  context,
}, info) => {
  await openWorkspaceSection(page, '节律');
  await page.getByRole('button', { name: '记录开始', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('开始日期', { exact: true })).toHaveValue(
    '2026-08-23',
  );
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('heading', { name: '进行中 · 第 1 天' })).toBeVisible();
  await page.getByRole('button', { name: '记录结束', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(page.locator('.period-history li')).toContainText('1 天');
  await page.getByRole('button', { name: '补录', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('开始日期', { exact: true }).fill('2026-07-29');
  await dialog.getByLabel('结束日期', { exact: true }).fill('2026-08-02');
  await context.setOffline(true);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('离线');
  await expect(dialog.getByLabel('开始日期', { exact: true })).toHaveValue(
    '2026-07-29',
  );
  await context.setOffline(false);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.period-history li')).toHaveCount(2);
  await expect(page.locator('.period-statistics')).toContainText('3 天');
  await expectNoUnexpectedHorizontalOverflow(page);
  const dateTarget = await page.locator('.rhythm-grid button').first().boundingBox();
  expect(dateTarget!.width).toBeGreaterThanOrEqual(44);
  expect(dateTarget!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath('rhythm.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(
    (await new AxeBuilder({ page }).include('.rhythm-panel').analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('rhythm-dark.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page
    .locator('.period-history li')
    .filter({ hasText: '2026-07-29' })
    .getByRole('button')
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('结束日期', { exact: true })
    .fill('2026-08-03');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(
    page.locator('.period-history li').filter({ hasText: '2026-07-29' }),
  ).toContainText('6 天');
  await page
    .locator('.period-history li')
    .filter({ hasText: '2026-07-29' })
    .getByRole('button')
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '删除记录', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: '确认删除' }).click();
  await expect(page.locator('.period-history li')).toHaveCount(1);
  await page.reload();
  await openWorkspaceSection(page, '节律');
  await expect(page.locator('.period-history li')).toHaveCount(1);
});

test('long titles, range filters, empty estimates and OS color preferences remain usable', async ({
  page,
}, info) => {
  const title = '需要完整显示的很长待安排任务名称 LongTitleWithoutSpacesForWrapping';
  await page.getByRole('button', { name: '添加普通事项', exact: true }).click();
  const form = page.locator('.quick-task-create-row');
  await form.getByLabel('普通事项内容').fill(title);
  await form.getByLabel('预计时长（分钟）').fill('90');
  await form.getByTitle('保存待办').click();
  const waiting = page.locator('.waiting-task-row').filter({ hasText: title });
  await expect(waiting).toContainText('1h30min');
  await expectNoUnexpectedHorizontalOverflow(page);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.screenshot({
    path: info.outputPath('home-long-title-dark-preference.png'),
    fullPage: true,
  });
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute(
    'content',
    /user-scalable=no|maximum-scale=1/,
  );
  await openWorkspaceSection(page, '洞察');
  await expect(page.getByRole('button', { name: '本周', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const preset of ['当天', '本月', '本周']) {
    await page.getByRole('button', { name: preset, exact: true }).click();
    await expect(page.locator('.insights-filters input')).toHaveCount(0);
  }
  await page.getByRole('button', { name: '自定义', exact: true }).click();
  await page
    .locator('.insights-filters')
    .getByLabel('开始', { exact: true })
    .fill('2030-01-01');
  await page
    .locator('.insights-filters')
    .getByLabel('结束', { exact: true })
    .fill('2030-01-02');
  await expect(page.locator('.insights-summary')).toContainText('暂无任务');
  await expect(page.locator('.insight-estimates')).toContainText('暂无足够数据');
  await expect(page.locator('.recharts-responsive-container')).toHaveCount(0);
  await expect(page.locator('[data-report-document]')).toContainText('暂无足够数据');
  await expectNoUnexpectedHorizontalOverflow(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({
    path: info.outputPath('insights-empty-light-preference.png'),
    fullPage: true,
  });
});
