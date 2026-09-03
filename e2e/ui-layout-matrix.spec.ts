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
  return (
    projectName.startsWith('ui-layout-mobile-') ||
    projectName === 'ui-layout-iphone-webkit'
  );
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

  test('mobile create state adheres to structural non-overlapping, hit area and horizontal boundaries', async ({
    page,
  }, testInfo) => {
    if (!isMobileLayoutProject(testInfo.project.name)) return;

    // 1. 测试今日日程移动端新增态结构
    const schedule = page.locator('.schedule-panel');
    await schedule.getByRole('button', { name: '添加', exact: true }).click();
    const timedRow = schedule.locator('.timed-task-create-row');
    await expect(timedRow).toBeVisible();

    const projectSelect = timedRow.locator('.project-inline-select');
    const titleInput = timedRow.locator('.timed-create-title-input');
    const startTimeInput = timedRow.getByLabel('开始时间');
    const endTimeInput = timedRow.getByLabel('结束时间');
    const plannedDisplay = timedRow.locator('.timed-create-mobile-duration-display');
    const actualInput = timedRow.getByLabel('实际耗时');
    const cancelBtn = timedRow.locator('.timed-create-cancel-btn');
    const confirmBtn = timedRow.locator('.timed-create-confirm-btn');

    // 验证各行元素均在水平 viewport 内，且无横向溢出
    await expectElementWithinHorizontalViewport(page, timedRow, '今日日程新增态卡片');
    await expectElementWithinHorizontalViewport(page, projectSelect, '项目选择');
    await expectElementWithinHorizontalViewport(page, titleInput, '任务名称输入框');
    await expectElementWithinHorizontalViewport(page, startTimeInput, '开始时间输入框');
    await expectElementWithinHorizontalViewport(page, endTimeInput, '结束时间输入框');
    await expectElementWithinHorizontalViewport(page, plannedDisplay, '预计时长展示');
    await expectElementWithinHorizontalViewport(page, actualInput, '实际耗时输入框');
    await expectElementWithinHorizontalViewport(page, cancelBtn, '取消按钮');
    await expectElementWithinHorizontalViewport(page, confirmBtn, '保存按钮');
    await expectNoUnexpectedHorizontalOverflow(page);

    // 验证内部行区域不重叠 (Row 1, Row 2, Row 3, Row 4)
    await expectElementsNotToOverlap(projectSelect, titleInput, '项目选择与任务名称');
    await expectElementsNotToOverlap(startTimeInput, endTimeInput, '开始时间与结束时间');
    await expectElementsNotToOverlap(plannedDisplay, actualInput, '预计时长与实际耗时');
    await expectElementsNotToOverlap(cancelBtn, confirmBtn, '取消按钮与保存按钮');
    await expectElementsNotToOverlap(titleInput, startTimeInput, '任务名称与开始时间');
    await expectElementsNotToOverlap(startTimeInput, plannedDisplay, '开始时间与预计时长');
    await expectElementsNotToOverlap(plannedDisplay, confirmBtn, '预计时长与保存按钮');

    // 断言真实可点击元素满足 iOS 44×44pt 触控目标，而不是只检查内部视觉按钮。
    const cancelBox = (await cancelBtn.boundingBox())!;
    const confirmBox = (await confirmBtn.boundingBox())!;
    expect(cancelBox.height).toBeGreaterThanOrEqual(44);
    expect(cancelBox.width).toBeGreaterThanOrEqual(44);
    expect(confirmBox.height).toBeGreaterThanOrEqual(44);
    expect(confirmBox.width).toBeGreaterThanOrEqual(44);

    // 验证预计时长自动计算
    await startTimeInput.fill('08:30');
    await endTimeInput.fill('10:00');
    await expect(plannedDisplay).toContainText('1h30min');

    // 2. 测试无时间待办移动端新增态紧凑单行结构
    const quickPanel = page.locator('.quick-panel');
    await quickPanel.getByRole('button', { name: '添加', exact: true }).click();
    const quickRow = quickPanel.locator('.quick-task-create-row');
    await expect(quickRow).toBeVisible();

    const quickCheckbox = quickRow.locator('.quick-create-check-cell');
    const quickProject = quickRow.locator('.quick-create-project');
    const quickTitle = quickRow.locator('.quick-create-title');
    const quickCancel = quickRow.locator('.quick-create-cancel-btn');
    const quickConfirm = quickRow.locator('.quick-create-confirm-btn');

    await expectElementWithinHorizontalViewport(page, quickRow, '无时间待办新增态卡片');
    await expectElementWithinHorizontalViewport(page, quickTitle, '待办内容输入框');
    await expectElementsNotToOverlap(quickCheckbox, quickProject, '待办 Checkbox 与项目');
    await expectElementsNotToOverlap(quickProject, quickTitle, '待办项目与待办内容');
    await expectElementsNotToOverlap(quickTitle, quickCancel, '待办内容与取消按钮');
    await expectElementsNotToOverlap(quickCancel, quickConfirm, '待办取消与保存按钮');

    const quickConfirmBox = (await quickConfirm.boundingBox())!;
    const quickCancelBox = (await quickCancel.boundingBox())!;
    expect(quickConfirmBox.height).toBeGreaterThanOrEqual(44);
    expect(quickConfirmBox.width).toBeGreaterThanOrEqual(44);
    expect(quickCancelBox.height).toBeGreaterThanOrEqual(44);
    expect(quickCancelBox.width).toBeGreaterThanOrEqual(44);

    // 3. 测试移动端已创建任务行紧凑卡片、操作收敛、44x44 触控区与完全无工作站操作
    const seededTimelineRow = schedule.locator('.timeline-row').first();
    await expect(seededTimelineRow).toBeVisible();
    await expect(seededTimelineRow.locator('.task-content-wrap')).toBeVisible();
    await expect(seededTimelineRow.locator('.timeline-meta')).toBeVisible();
    await expect(seededTimelineRow.locator('.task-drag-handle')).toBeHidden();
    await expect(seededTimelineRow.locator('.task-workstation-action')).toBeHidden();

    const checkWrap = seededTimelineRow.locator('.task-check-wrap');
    const contentWrap = seededTimelineRow.locator('.task-content-wrap');
    const actionsCell = seededTimelineRow.locator('.task-actions-cell');
    await expectElementsNotToOverlap(checkWrap, contentWrap, 'Checkbox 触控区与任务内容');
    await expectElementsNotToOverlap(contentWrap, actionsCell, '任务内容与更多操作按钮');

    const checkWrapBox = (await checkWrap.boundingBox())!;
    expect(checkWrapBox.width).toBeGreaterThanOrEqual(44);
    expect(checkWrapBox.height).toBeGreaterThanOrEqual(44);

    const moreBtn = seededTimelineRow.getByLabel('邮件处理更多操作');
    await expect(moreBtn).toBeVisible();
    const moreBtnBox = (await moreBtn.boundingBox())!;
    expect(moreBtnBox.width).toBeGreaterThanOrEqual(44);
    expect(moreBtnBox.height).toBeGreaterThanOrEqual(44);

    await moreBtn.click();
    const moreMenu = seededTimelineRow.locator('.task-actions > div');
    await expect(moreMenu).toBeVisible();
    await expect(moreMenu.getByText('加入工作站')).toHaveCount(0);
    await expect(moreMenu.getByText('从工作站移除')).toHaveCount(0);
    await expect(moreMenu.getByText('详细编辑')).toBeVisible();
    await expect(moreMenu.getByText('删除')).toBeVisible();

    await expectNoUnexpectedHorizontalOverflow(page);
  });
});
