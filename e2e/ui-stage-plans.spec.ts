/** @fileoverview 计划卡片与完整阶段清单的深浅色、宽度矩阵、焦点和 axe 验证。 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';

/** 使用字段与生产一致的虚构演示记录，直接读取现有 fallback 项目，不创建新业务字段。 */
async function seedStageLayout(page: Page) {
  await page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('threadline.projects.v1')!);
    const tasks = JSON.parse(localStorage.getItem('threadline.tasks.v1')!);
    const now = new Date().toISOString();
    const plans = ['国庆假期', '德国访学准备', 'IELTS 冲刺', '期末周'].map(
      (name, index) => ({
        id: crypto.randomUUID(),
        name,
        startDate:
          index === 2 ? '2026-08-25' : index === 3 ? '2026-08-01' : '2026-08-23',
        endDate: index === 3 ? '2026-08-10' : '2026-08-30',
        homeVisible: index !== 3,
        createdAt: now,
        updatedAt: now,
      }),
    );
    for (const [index, plan] of plans.entries()) {
      for (let i = 1; i <= (index === 0 ? 16 : 6); i++) {
        tasks.push({
          id: crypto.randomUUID(),
          title:
            i === 1
              ? '整理这段时间的课程资料与访学申请清单，记录需要继续跟进的事项和完整准备步骤'
              : plan.name + '任务' + i,
          projectId: projects.find(
            (project: { isFallback: boolean }) => project.isFallback,
          ).id,
          stagePlanId: plan.id,
          status: i <= 3 ? 'waiting' : 'active',
          completed: i >= 7,
          date: i <= 3 ? undefined : i <= 5 ? '2026-08-23' : '2026-08-25',
          importance: 'normal',
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    localStorage.setItem('threadline.stage-plans.v1', JSON.stringify(plans));
    localStorage.setItem('threadline.tasks.v1', JSON.stringify(tasks));
    const dailies = JSON.parse(localStorage.getItem('threadline.daily-templates.v1')!);
    for (const daily of dailies) {
      for (const child of daily.children) child.templateItemId ??= crypto.randomUUID();
    }
    localStorage.setItem('threadline.daily-templates.v1', JSON.stringify(dailies));
  });
  await page.reload();
  await expect(page.locator('.home-stage-card')).toHaveCount(3);
}

/** 像素主题由现有外观控件选择，随后复核真实颜色和横向溢出。 */
async function choosePixelTheme(page: Page) {
  await openWorkspaceSection(page, '设置');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('button', { name: /皮卡小屋/ }).click();
}

/** 全部可见阶段任务均参与布局与可访问性检查，不允许通过截断长清单规避。 */
async function verifyLayout(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    page: document.documentElement.scrollWidth,
    overflow: Array.from(
      document.querySelectorAll<HTMLElement>(
        '.stage-task-title,.stage-plan-card,.plan-section',
      ),
    )
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.right > innerWidth + 1 || box.left < -1;
      })
      .map((element) => element.className),
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.overflow).toEqual([]);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(
    violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    ),
  ).toEqual([]);
}

test('keeps all pinned tasks and card sections readable in both color schemes', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await bootstrapLocalAdapterWorkspace(page, 'stage-layout.' + info.testId);
  await seedStageLayout(page);
  await choosePixelTheme(page);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.clock.runFor(350);
    await expect(page.locator('html')).toHaveAttribute(
      'data-color-scheme',
      colorScheme,
    );
    await openWorkspaceSection(page, '首页');
    await expect(
      page
        .locator('.home-stage-card')
        .filter({ hasText: '国庆假期' })
        .locator('.stage-task-row'),
    ).toHaveCount(16);
    await verifyLayout(page);
    await openWorkspaceSection(page, '计划');
    await expect(
      page.getByRole('heading', { level: 1, name: '计划', exact: true }),
    ).toHaveCount(1);
    await expect(page.locator('.stage-plan-card')).toHaveCount(2);
    await page.getByRole('tab', { name: /^进行中/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /^即将开始/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('ArrowLeft');
    await verifyLayout(page);
    if (
      [
        'ui-layout-desktop-1440',
        'ui-layout-mobile-390',
        'ui-layout-mobile-320',
      ].includes(info.project.name)
    ) {
      await page.screenshot({
        path:
          'docs/screenshots/stage-plans/' +
          info.project.name +
          '-' +
          colorScheme +
          '.png',
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: '查看阶段 国庆假期', exact: true }).click();
    await expect(
      page.getByTestId('stage-detail').locator('.stage-task-row'),
    ).toHaveCount(16);
    await verifyLayout(page);
    await page.getByRole('button', { name: '返回计划', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '查看阶段 国庆假期', exact: true }),
    ).toBeFocused();
    await page.getByRole('button', { name: '+ 新建阶段', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '新建阶段', exact: true });
    await expect(editor.getByLabel('阶段名称', { exact: true })).toBeFocused();
    await verifyLayout(page);
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
  }
});
