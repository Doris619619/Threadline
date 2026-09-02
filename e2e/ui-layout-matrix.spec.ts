/**
 * @fileoverview 在精简桌面与移动 viewport 矩阵中验证工作台与任务 Dialog 的结构安全。
 */

import { expect, test, type Page } from '@playwright/test';
import {
  expectElementFullyWithinViewport,
  expectElementWithinHorizontalViewport,
  expectElementsNotToOverlap,
  expectNoUnexpectedHorizontalOverflow,
  expectOneVisibleActiveMainNavigation,
} from './support/layout';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
  openSeededTaskEditor,
} from './support/workspace';

/** 根据专用 Playwright project 名称识别触控 viewport，而不依赖当前 CSS breakpoint 的实现细节。 */
function isMobileLayoutProject(projectName: string) {
  return projectName.startsWith('ui-layout-mobile-');
}

/**
 * 验证移动端没有把仅供原生桌面窗口使用的入口暴露到 Web/PWA 任务表面。
 */
async function expectMobileDesktopControlsHidden(page: Page) {
  await expect(page.getByRole('button', { name: '迷你今日', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: '工作站', exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('.tl-window-controls')).toHaveCount(0);
  await expect(page.locator('.schedule-resize-handle')).toBeHidden();
}

test.describe('compact viewport layout matrix', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await bootstrapLocalAdapterWorkspace(
      page,
      `threadline.ui-matrix.${testInfo.testId}`,
    );
  });

  test('keeps the home shell, title, and seeded task usable', async ({
    page,
  }, testInfo) => {
    const home = page.getByTestId('home-panel');
    const header = page.locator('.tl-header');
    const title = header.getByRole('heading', { level: 1, name: '我的工作台' });
    const dateToolbar = header.locator('.tl-date');
    const seededTask = page
      .locator('.timeline-row')
      .filter({ hasText: '邮件处理' })
      .locator('.task-title');

    await expect(home).toBeVisible();
    await expect(seededTask).toBeVisible();
    await expectOneVisibleActiveMainNavigation(page);
    await expectNoUnexpectedHorizontalOverflow(page);
    await expectElementWithinHorizontalViewport(
      page,
      page.locator('.tl-window'),
      '应用 shell',
    );
    await expectElementWithinHorizontalViewport(page, home, '首页模块');
    await expectElementWithinHorizontalViewport(page, seededTask, '种子任务标题');
    await expectElementsNotToOverlap(title, dateToolbar, '页标题与日期工具栏');
    await expectElementsNotToOverlap(header, home, '页头与首页主体');

    if (isMobileLayoutProject(testInfo.project.name)) {
      await expectMobileDesktopControlsHidden(page);
      await expect(page.getByLabel('移动端主导航', { exact: true })).toBeVisible();
    } else {
      await expect(page.getByLabel('主导航', { exact: true })).toBeVisible();
    }
  });

  test('keeps the seeded task editor fully inside the viewport', async ({ page }) => {
    await openSeededTaskEditor(page);
    await expectElementFullyWithinViewport(
      page,
      page.getByRole('dialog', { name: '编辑任务' }),
      '编辑任务 Dialog',
    );
  });

  test('keeps Daily draft names and planned minutes editable without horizontal overflow', async ({
    page,
  }) => {
    await openWorkspaceSection(page, '项目');
    await page.getByRole('button', { name: '新建 Daily', exact: true }).click();
    await page.getByRole('button', { name: '+ 添加清单项', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建 Daily' });
    const row = dialog.locator('.daily-draft-row');
    await expect(row).toBeVisible();
    await expectElementFullyWithinViewport(page, dialog, '新建 Daily Dialog');
    await expectElementWithinHorizontalViewport(
      page,
      row.getByLabel('清单项名称 1'),
      'Daily 清单名称输入框',
    );
    await expectElementWithinHorizontalViewport(
      page,
      row.getByLabel('预计时间 1'),
      'Daily 预计分钟输入框',
    );
    await expectNoUnexpectedHorizontalOverflow(page);
  });
});
