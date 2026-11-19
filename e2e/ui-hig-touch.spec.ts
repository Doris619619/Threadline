/** @fileoverview 以真实可点击矩形复核手机计时器与日历/节律导航，避免把视觉图标或静态CSS尺寸当命中区。 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';

/** 只测实际可见控件，允许浏览器对44px产生亚像素舍入；逐个确认中心未被邻近元素覆盖。 */
async function expectTouchTargets(controls: Locator, minimum = 44) {
  await expect(controls.first()).toBeVisible();
  expect(await controls.count()).toBeGreaterThan(0);
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    await control.scrollIntoViewIfNeeded();
    // 以正常页面滚动把目标带到可用中部，避免把固定底部导航上的最邻近滚动位置误报为不可达。
    await control.evaluate((element) =>
      element.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'instant',
      }),
    );
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(minimum - 0.001);
    expect(box!.height).toBeGreaterThanOrEqual(minimum - 0.001);
    const hit = await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const target = element.ownerDocument.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return {
        clear: target === element || element.contains(target),
        label: element.getAttribute('aria-label') ?? element.textContent,
        target: target?.tagName + '.' + target?.className,
        bounds: box.toJSON(),
      };
    });
    expect(hit.clear, JSON.stringify(hit)).toBe(true);
  }
}

/** 在当前演示/本地适配器的独立命名空间建立三条固定计时，不访问真实账号。 */
async function restoreThreeTimers(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((key) => key.endsWith('threadline.tasks.v1')),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) =>
      key.endsWith('threadline.tasks.v1'),
    )!;
    const tasks = JSON.parse(localStorage.getItem(key)!);
    const now = Date.now();
    localStorage.setItem(
      key.replace('threadline.tasks.v1', 'threadline.task-timers.v1:local'),
      JSON.stringify(
        tasks.slice(0, 3).map((task: { id: string; title: string }, index: number) => ({
          id: `hig-touch-${index}`,
          taskId: task.id,
          title: task.title,
          mode: 'up',
          targetMs: 60000,
          elapsedMs: 0,
          startedAt: now,
          firstStartedAt: now,
          entryDate: '2026-08-23',
          timezone: 'Asia/Shanghai',
          intervals: [],
        })),
      ),
    );
  });
  await page.reload();
  await expect(page.locator('.task-timer')).toHaveCount(3);
}

/** 每个用例使用固定业务日期与隔离缓存，结果不依赖真实用户数据。 */
test.beforeEach(async ({ page }, info) => {
  await bootstrapLocalAdapterWorkspace(page, `threadline.hig-touch.${info.testId}`);
});

/** 覆盖每个可见计时按钮，确保已有44px触控修复在所有手机断点继续成立。 */
test('keeps timer actions reachable at the input-specific minimum size', async ({
  page,
}) => {
  await restoreThreeTimers(page);
  const minimum = await page.evaluate(() =>
    matchMedia('(hover: none), (pointer: coarse), (max-width: 760px)').matches
      ? 44
      : 32,
  );
  await expectTouchTargets(page.locator('.task-timer button'), minimum);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});

/** 当前日历使用PlanningMonth而非旧CalendarToolbar；检查真实导航按钮及月份变化。 */
test('keeps month navigation 44px without covering the title', async ({ page }) => {
  await openWorkspaceSection(page, '日历');
  const navigation = page.getByRole('navigation', { name: '月份导航', exact: true });
  await expectTouchTargets(navigation.getByRole('button'));
  const heading = await page.locator('.planning-month-heading h2').boundingBox();
  const actions = await navigation.boundingBox();
  expect(heading!.x + heading!.width).toBeLessThanOrEqual(actions!.x + 1);
  await navigation.getByRole('button', { name: '下个月' }).click();
  await expect(page.locator('.planning-month-heading h2')).toHaveAttribute(
    'aria-label',
    '2026年9月',
  );
  await navigation.getByRole('button', { name: '上个月' }).click();
  await expect(page.locator('.planning-month-heading h2')).toHaveAttribute(
    'aria-label',
    '2026年8月',
  );
});

/** 节律导航共享旧选择器但已有44px专用覆盖，锁定实际级联与可操作性。 */
test('keeps rhythm navigation at least 44px across mobile widths', async ({ page }) => {
  await openWorkspaceSection(page, '节律');
  await expectTouchTargets(page.locator('.rhythm-calendar header button'));
  await page
    .locator('.rhythm-calendar')
    .getByRole('button', { name: '下个月', exact: true })
    .click();
  await expect(page.locator('.rhythm-calendar header h2')).toContainText(
    '2026 年 09 月',
  );
  await page
    .locator('.rhythm-calendar')
    .getByRole('button', { name: '回到本月', exact: true })
    .click();
  await expect(page.locator('.rhythm-calendar header h2')).toContainText(
    '2026 年 08 月',
  );
});

/** 为新增发现的小目标补跨页面手机回归，实际点击时保持相邻目标独立且不被覆盖。 */
test('keeps project, stage, waiting and Together controls accessible on touch screens', async ({
  page,
}) => {
  test.skip(
    !(await page.evaluate(
      () => matchMedia('(hover: none), (pointer: coarse), (max-width: 760px)').matches,
    )),
    '此用例覆盖触控布局的44px目标，桌面紧凑目标另有检查。',
  );
  const project = page.locator('.task-project-trigger').filter({ visible: true });
  const stage = page.locator('.stage-title-link').filter({ visible: true });
  const more = page
    .locator('.waiting-task-actions .task-context-trigger')
    .filter({ visible: true });
  await expect(stage.first()).toBeVisible();
  await expectTouchTargets(project);
  await expectTouchTargets(stage);
  await expectTouchTargets(more);
  await project.first().click();
  await expect(page.getByRole('group', { name: /选择项目$/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await more.first().click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await openWorkspaceSection(page, '两人空间');
  const settings = page.getByRole('button', { name: '空间设置', exact: true });
  await expectTouchTargets(settings);
  await settings.click();
  await expect(
    page.getByRole('dialog', { name: '空间设置', exact: true }),
  ).toBeVisible();
});
