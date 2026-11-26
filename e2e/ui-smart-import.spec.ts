/** @fileoverview 通过真实开发页面与固定解析响应验证智能导入的焦点、经典主题无底线反馈、触屏目标和局部滚动，不调用模型或数据库。 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { bootstrapLocalAdapterWorkspace } from './support/workspace';
import { openAiApiSettingsFixture } from './support/ai-api-settings-fixture';

/** 未设置固定响应的本机解析一律取消，测试不能意外转发到用户可能运行的内存代理。 */
test.beforeEach(async ({ page }) => {
  await page.route('**/api/local-smart-import', (route) => route.abort());
});

/** 只拦截同源开发解析并匹配实际演示 fallback，保留生产禁止本地解析的边界。 */
async function openImport(page: Page) {
  await page.route('**/api/local-smart-import', async (route) => {
    const { projects } = route.request().postDataJSON() as {
      projects: { id: string; isFallback: boolean }[];
    };
    const fallback = projects.find((project) => project.isFallback);
    expect(fallback).toBeDefined();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        tasks: [
          {
            title: '完成课程作业',
            projectId: fallback!.id,
            plannedMinutes: 30,
            startTime: null,
            endTime: null,
            actualMinutes: null,
          },
        ],
      }),
    });
  });
  await bootstrapLocalAdapterWorkspace(page, 'smart-import-hig');
  await page.getByRole('button', { name: '智能导入', exact: true }).click();
  return page.getByRole('dialog', { name: '智能导入任务', exact: true });
}

/** 比较失焦与键盘聚焦的真实计算样式，要求可见边框反馈且无外围轮廓或光晕。 */
async function expectInternalFieldFocus(page: Page, field: Locator) {
  await field.evaluate((element) => (element as HTMLElement).blur());
  const before = await field.evaluate(
    (element) => getComputedStyle(element).borderColor,
  );
  await page.keyboard.press('Tab');
  await field.focus();
  const focused = await field.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      keyboard: element.matches(':focus-visible'),
      outline: style.outlineStyle,
      shadow: style.boxShadow,
      border: style.borderColor,
    };
  });
  expect.soft(focused.keyboard).toBe(true);
  expect.soft(focused.outline).toBe('none');
  expect
    .soft(
      focused.shadow === 'none' ||
        focused.shadow
          .split(/,(?![^()]*\))/)
          .every((shadow) => shadow.includes('inset')),
    )
    .toBe(true);
  expect.soft(focused.border).not.toBe(before);
}

/** 在已挂载的真实界面切换经典主题与明暗根属性，仅改变当前测试页面的样式作用域。 */
async function applyClassicTheme(page: Page, colorScheme: 'light' | 'dark') {
  await page.evaluate((scheme) => {
    document.documentElement.dataset.theme = 'classic';
    document.documentElement.dataset.colorScheme = scheme;
  }, colorScheme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic');
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', colorScheme);
}

/** 用指针和真实 Tab 导航检查经典字段：只保留边框焦点，不能出现底部 inset 阴影。 */
async function expectClassicFieldFocus(page: Page, field: Locator) {
  await field.evaluate((element) => (element as HTMLElement).blur());
  const restingBorder = await field.evaluate(
    (element) => getComputedStyle(element).borderColor,
  );
  await field.click();
  await expect(field).toBeFocused();
  await expect(field).toHaveCSS('box-shadow', 'none');
  await expect(field).toHaveCSS('outline-style', 'none');
  await expect
    .poll(() => field.evaluate((element) => getComputedStyle(element).borderColor))
    .not.toBe(restingBorder);
  // 原生 select 的指针点击会展开选单；先关闭选单，再检查键盘进入同一字段。
  if (await field.evaluate((element) => element.tagName === 'SELECT'))
    await page.keyboard.press('Escape');
  await field.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  expect(await field.evaluate((element) => element.matches(':focus-visible'))).toBe(
    true,
  );
  await expect(field).toHaveCSS('box-shadow', 'none');
  await expect(field).toHaveCSS('outline-style', 'none');
  await expect
    .poll(() => field.evaluate((element) => getComputedStyle(element).borderColor))
    .not.toBe(restingBorder);
}

/** 强制色移除普通阴影后，字段仍须保留共享系统的两像素实线轮廓。 */
async function expectForcedColorFieldFocus(page: Page, field: Locator) {
  await page.keyboard.press('Tab');
  await field.focus();
  await expect(field).toHaveCSS('box-shadow', 'none');
  await expect(field).toHaveCSS('outline-style', 'solid');
  await expect(field).toHaveCSS('outline-width', '2px');
}

for (const colorScheme of ['light', 'dark'] as const) {
  /** 固定解析夹具覆盖原文和全部五列字段，避免仅用静态 CSS 断言遗漏真实焦点优先级。 */
  test(`classic ${colorScheme} focus keeps source and reviewed fields free of bottom shadows`, async ({
    page,
  }) => {
    const dialog = await openImport(page);
    await applyClassicTheme(page, colorScheme);
    const source = dialog.getByLabel('待解析内容');
    await expectClassicFieldFocus(page, source);
    await page.emulateMedia({ forcedColors: 'active' });
    await expectForcedColorFieldFocus(page, source);
    await page.emulateMedia({ forcedColors: 'none' });
    await source.fill('完成课程作业，预计 30 分钟');
    await dialog.getByRole('button', { name: '开始解析', exact: true }).click();
    const review = page.getByRole('dialog', { name: '确认导入任务', exact: true });
    const fields = ['项目', '名称', '预计时长', '开始时间', '结束时间'].map((label) =>
      review.getByLabel(`任务 1 ${label}`, { exact: true }),
    );
    for (const field of fields) await expectClassicFieldFocus(page, field);
    await page.emulateMedia({ forcedColors: 'active' });
    for (const field of fields) await expectForcedColorFieldFocus(page, field);
  });

  /** 凭据夹具挂载真实设置组件；账号状态由内存提供，不保存或发送任何供应商凭据。 */
  test(`classic ${colorScheme} focus keeps the real API credential field free of bottom shadows`, async ({
    page,
  }) => {
    await openAiApiSettingsFixture(page);
    await applyClassicTheme(page, colorScheme);
    const field = page.getByLabel('DeepSeek API Key', { exact: true });
    await expectClassicFieldFocus(page, field);
    await page.emulateMedia({ forcedColors: 'active' });
    await expectForcedColorFieldFocus(page, field);
  });
}

test('keeps keyboard focus inside source and reviewed fields', async ({ page }) => {
  const dialog = await openImport(page);
  const source = dialog.getByLabel('待解析内容');
  await expectInternalFieldFocus(page, source);
  await source.fill('完成课程作业，预计 30 分钟');
  await dialog.getByRole('button', { name: '开始解析', exact: true }).click();
  const review = page.getByRole('dialog', { name: '确认导入任务', exact: true });
  for (const label of ['项目', '名称', '预计时长', '开始时间', '结束时间']) {
    await expectInternalFieldFocus(
      page,
      review.getByLabel(`任务 1 ${label}`, { exact: true }),
    );
  }
});

test('keeps API credential focus inside the real settings field', async ({ page }) => {
  await openAiApiSettingsFixture(page);
  const field = page.getByLabel('DeepSeek API Key', { exact: true });
  await expectInternalFieldFocus(page, field);
  await page.emulateMedia({ forcedColors: 'active' });
  await field.focus();
  await expect(field).toHaveCSS('outline-style', 'solid');
  await expect(field).toHaveCSS('outline-width', '2px');
});

test('keeps every import touch target at least 44 CSS pixels', async ({ page }) => {
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  const dialog = await openImport(page);
  await dialog.getByLabel('待解析内容').fill('完成课程作业，预计 30 分钟');
  await dialog.getByRole('button', { name: '开始解析', exact: true }).click();
  const review = page.getByRole('dialog', { name: '确认导入任务', exact: true });
  const targets = await review
    .locator(
      'header > button, footer button, .import-task-selection, .import-task-action button, .import-task-fields :is(input, select, textarea)',
    )
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          label: element.getAttribute('aria-label') ?? element.textContent,
          width: box.width,
          height: box.height,
        };
      }),
    );
  expect(targets.length).toBeGreaterThanOrEqual(10);
  for (const target of targets) {
    expect.soft(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
    expect.soft(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
  }
  expect(
    await review.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  const table = review.getByRole('region', { name: '待导入任务表格' });
  if ((page.viewportSize()?.width ?? 0) <= 760)
    expect(
      await table.evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(true);
});
