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
  openProjectCreateDialog,
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

  test('shows every Daily field with full names and iOS touch targets', async ({
    page,
  }, info) => {
    const longName = '完成一道动态规划题并完整记录状态转移方程和解题思路';
    await page.evaluate((title) => {
      const daily = {
        id: 'layout-daily',
        title: '算法训练',
        actual: 0,
        completed: false,
        result: '',
        children: [
          {
            id: 'layout-one',
            title,
            plannedDurationMinutes: 30,
            completed: false,
            actual: 0,
          },
          {
            id: 'layout-two',
            title: '复盘昨天的错题',
            plannedDurationMinutes: 20,
            completed: false,
            actual: 0,
          },
        ],
      };
      localStorage.setItem(
        'threadline.daily-by-date.v1',
        JSON.stringify({ '2026-08-23': [daily] }),
      );
      localStorage.setItem('threadline.daily-templates.v1', JSON.stringify([daily]));
    }, longName);
    await page.reload();
    const daily = page.getByRole('region', { name: 'Daily 算法训练', exact: true });
    await expect(daily.getByText(longName, { exact: true })).toBeVisible();
    await expect(daily.getByText('预计 30 分钟', { exact: true })).toBeVisible();
    await expect(daily.getByText('预计 50 分钟', { exact: true })).toBeVisible();
    await expect(daily.locator('textarea')).toHaveCount(0);
    await expect(daily.getByRole('spinbutton')).toHaveCount(2);
    await expect(daily.locator('details, [aria-expanded]')).toHaveCount(0);
    for (const name of await daily
      .locator('.daily-parent-title, .daily-child-name')
      .all()) {
      const dimensions = await name.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
      expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight + 1);
    }
    for (const circle of await daily.locator('.daily-check').all()) {
      const box = (await circle.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44 - 0.001);
      expect(box.height).toBeGreaterThanOrEqual(44 - 0.001);
    }
    for (const input of await daily.locator('input[type=number], textarea').all()) {
      await expectElementWithinHorizontalViewport(page, input, 'Daily 输入');
      expect(
        await input.evaluate((element) =>
          parseFloat(getComputedStyle(element).fontSize),
        ),
      ).toBeGreaterThanOrEqual(16);
    }
    const firstInput = daily.getByLabel('算法训练 ' + longName + '实际耗时');
    await firstInput.fill('18');
    await daily.getByRole('checkbox', { name: '完成 ' + longName }).check();
    await expect(
      daily.getByRole('checkbox', { name: '完成 Daily 算法训练' }),
    ).toBeChecked();
    await expect(daily.locator('.daily-actual-total strong')).toHaveText('18');
    await expectNoUnexpectedHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath('daily-home.png'), fullPage: true });
    await page.reload();
    await expect(firstInput).toHaveValue('18');
    await expect(
      daily.getByRole('checkbox', { name: '完成 Daily 算法训练' }),
    ).toBeChecked();
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
    await openProjectCreateDialog(page, '新建 Daily');
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

  test('keeps the grouped project page singular, contained, and reachable through one create entry', async ({
    page,
  }, testInfo) => {
    await openWorkspaceSection(page, '项目');
    const panel = page.getByTestId('project-panel');
    const newTrigger = page.getByRole('button', { name: '新建', exact: true });

    await expect(
      page.getByRole('heading', { level: 1, name: '项目', exact: true }),
    ).toHaveCount(1);
    await expect(page.locator('h1').filter({ hasText: /^项目$/ })).toHaveCount(1);
    await expect(page.locator('.tl-header')).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: /我的项目/ })).toBeVisible();
    await expect(panel.getByRole('heading', { name: /Daily/ })).toBeVisible();
    await expectElementWithinHorizontalViewport(page, panel, '项目管理页面');
    await expectNoUnexpectedHorizontalOverflow(page);

    if (isMobileLayoutProject(testInfo.project.name)) {
      const triggerBox = (await newTrigger.boundingBox())!;
      expect(triggerBox.height).toBeGreaterThanOrEqual(44 - 0.001);
      expect(triggerBox.width).toBeGreaterThanOrEqual(44 - 0.001);
    }

    await openProjectCreateDialog(page, '新建项目');
    await expect(page.getByLabel('项目名称')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '新建项目' })).toBeHidden();

    await openProjectCreateDialog(page, '新建 Daily');
    await expect(page.getByLabel('Daily 名称')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '新建 Daily' })).toBeHidden();
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
    const plannedDisplay = timedRow.getByLabel('预计时长（分钟）');
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
    await expectElementsNotToOverlap(
      startTimeInput,
      endTimeInput,
      '开始时间与结束时间',
    );
    await expectElementsNotToOverlap(plannedDisplay, actualInput, '预计时长与实际耗时');
    await expectElementsNotToOverlap(cancelBtn, confirmBtn, '取消按钮与保存按钮');
    await expectElementsNotToOverlap(titleInput, startTimeInput, '任务名称与开始时间');
    await expectElementsNotToOverlap(
      startTimeInput,
      plannedDisplay,
      '开始时间与预计时长',
    );
    await expectElementsNotToOverlap(plannedDisplay, confirmBtn, '预计时长与保存按钮');

    // 断言真实可点击元素满足 iOS 44×44pt 触控目标，而不是只检查内部视觉按钮。
    // Chromium page scaling can report 44px as 43.999969px; allow only this subpixel rounding error.
    const cancelBox = (await cancelBtn.boundingBox())!;
    const confirmBox = (await confirmBtn.boundingBox())!;
    expect(cancelBox.height).toBeGreaterThanOrEqual(44 - 0.001);
    expect(cancelBox.width).toBeGreaterThanOrEqual(44 - 0.001);
    expect(confirmBox.height).toBeGreaterThanOrEqual(44 - 0.001);
    expect(confirmBox.width).toBeGreaterThanOrEqual(44 - 0.001);

    for (const [control, label] of [
      [projectSelect, '今日日程项目选择'],
      [titleInput, '今日日程任务名称'],
      [startTimeInput, '今日日程开始时间'],
      [endTimeInput, '今日日程结束时间'],
      [plannedDisplay, '今日日程预计时长'],
      [actualInput, '今日日程实际耗时'],
    ] as const) {
      expect(
        (await control.boundingBox())?.height,
        `${label}触控高度`,
      ).toBeGreaterThanOrEqual(44 - 0.001);
    }

    // 验证预计是独立可编辑分钟；修改起止时间不自动填写它。
    await startTimeInput.fill('08:30');
    await endTimeInput.fill('10:00');
    await expect(plannedDisplay).toHaveValue('');
    await plannedDisplay.fill('90');
    await expect(plannedDisplay).toHaveValue('90');
    await expect(timedRow.locator('.estimate-preview')).toHaveCount(0);
    await expect(
      timedRow.getByRole('button', { name: '清空预计，设为待定' }),
    ).toHaveCount(0);
    await endTimeInput.fill('11:00');
    await expect(plannedDisplay).toHaveValue('90');

    // 2. 测试无时间待办移动端新增态紧凑单行结构
    const waitingPanel = page.locator('.waiting-panel');
    await waitingPanel
      .getByRole('button', { name: '添加普通事项', exact: true })
      .click();
    const quickRow = waitingPanel.locator('.quick-task-create-row');
    await expect(quickRow).toBeVisible();

    const quickProject = quickRow.locator('.quick-create-project');
    const quickTitle = quickRow.locator('.quick-create-title');
    const quickCancel = quickRow.locator('.quick-create-cancel-btn');
    const quickConfirm = quickRow.locator('.quick-create-confirm-btn');

    await expectElementWithinHorizontalViewport(page, quickRow, '无时间待办新增态卡片');
    await expectElementWithinHorizontalViewport(page, quickTitle, '待办内容输入框');
    const quickEstimate = quickRow.getByLabel('预计时长（分钟）');
    await expectElementWithinHorizontalViewport(page, quickEstimate, '待安排预计');
    await expectElementsNotToOverlap(quickTitle, quickEstimate, '任务内容与预计分钟');
    await expectElementsNotToOverlap(quickProject, quickTitle, '待办项目与待办内容');
    await expectElementsNotToOverlap(quickTitle, quickCancel, '待办内容与取消按钮');
    await expectElementsNotToOverlap(quickCancel, quickConfirm, '待办取消与保存按钮');

    const quickConfirmBox = (await quickConfirm.boundingBox())!;
    const quickCancelBox = (await quickCancel.boundingBox())!;
    expect(quickConfirmBox.height).toBeGreaterThanOrEqual(44 - 0.001);
    expect(quickConfirmBox.width).toBeGreaterThanOrEqual(44 - 0.001);
    expect(quickCancelBox.height).toBeGreaterThanOrEqual(44 - 0.001);
    expect(quickCancelBox.width).toBeGreaterThanOrEqual(44 - 0.001);

    for (const [control, label] of [
      [quickProject.locator('.project-inline-select'), '无时间待办项目选择'],
      [quickTitle, '无时间待办任务名称'],
    ] as const) {
      expect(
        (await control.boundingBox())?.height,
        `${label}触控高度`,
      ).toBeGreaterThanOrEqual(44 - 0.001);
    }

    // 3. 测试移动端已创建任务行紧凑卡片、操作收敛、44x44 触控区与完全无工作站操作
    const seededTimelineRow = schedule.locator('.timeline-row').first();
    await expect(seededTimelineRow).toBeVisible();
    await expect(seededTimelineRow.locator('.task-content-wrap')).toBeVisible();
    await expect(seededTimelineRow.locator('.timeline-meta')).toBeVisible();
    await expect(seededTimelineRow.locator('.task-drag-handle')).toBeHidden();
    await expect(seededTimelineRow.locator('.task-workstation-action')).toBeHidden();

    const checkWrap = seededTimelineRow.locator('.task-check-wrap');
    const actionsCell = seededTimelineRow.locator('.task-actions-cell');
    // display:contents 不生成盒子；逐一检查真正渲染的内容，保留不重叠的原约束。
    for (const content of await seededTimelineRow
      .locator('.task-title, .task-project-cell, .timeline-time, .task-duration')
      .all()) {
      await expectElementsNotToOverlap(checkWrap, content, 'Checkbox 触控区与任务内容');
      await expectElementsNotToOverlap(content, actionsCell, '任务内容与更多操作按钮');
      await expectElementWithinHorizontalViewport(page, content, '日程内容');
    }

    const checkWrapBox = (await checkWrap.boundingBox())!;
    expect(checkWrapBox.width).toBeGreaterThanOrEqual(44 - 0.001);
    expect(checkWrapBox.height).toBeGreaterThanOrEqual(44 - 0.001);

    const moreBtn = seededTimelineRow.getByLabel('邮件处理更多操作');
    await expect(moreBtn).toBeVisible();
    const moreBtnBox = (await moreBtn.boundingBox())!;
    expect(moreBtnBox.width).toBeGreaterThanOrEqual(44 - 0.001);
    expect(moreBtnBox.height).toBeGreaterThanOrEqual(44 - 0.001);

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
