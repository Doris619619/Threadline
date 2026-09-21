/**
 * @fileoverview 验证主要工作区页面的非视觉结构合同，不建立 screenshot baseline。
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  expectElementFullyWithinViewport,
  expectElementWithinHorizontalViewport,
  expectNoUnexpectedHorizontalOverflow,
  expectOneVisibleActiveMainNavigation,
} from './support/layout';
import {
  bootstrapLocalAdapterWorkspace,
  openWorkspaceSection,
} from './support/workspace';

type WorkspaceViewContract = {
  label: string;
  heading: string;
  panelTestId: string;
  keyControl: (page: Page) => Locator;
};

/** 每个主要工作区入口的唯一容器、页级标题与关键可操作元素合同。 */
const primaryWorkspaceViews: WorkspaceViewContract[] = [
  {
    label: '首页',
    heading: '任务大厅',
    panelTestId: 'home-panel',
    keyControl: (page) => page.getByRole('heading', { name: '今日日程', exact: true }),
  },
  {
    label: '规划',
    heading: '规划',
    panelTestId: 'calendar-panel',
    keyControl: (page) =>
      page
        .getByRole('group', { name: /任务分布$/ })
        .getByRole('button')
        .first(),
  },
  {
    label: '项目',
    heading: '项目',
    panelTestId: 'project-panel',
    keyControl: (page) => page.getByRole('button', { name: '新建', exact: true }),
  },
  {
    label: '洞察',
    heading: '洞察',
    panelTestId: 'insights-panel',
    keyControl: (page) => page.getByRole('button', { name: '本周', exact: true }),
  },
  {
    label: '设置',
    heading: '设置',
    panelTestId: 'settings-panel',
    keyControl: (page) => page.getByRole('button', { name: /^数据与同步/ }),
  },
];

/**
 * 对一个可见页面执行共同结构断言，保持页面尺寸和视觉 token 可自由演进。
 */
async function expectPrimaryViewContract(page: Page, view: WorkspaceViewContract) {
  const panel = page.getByTestId(view.panelTestId);
  await expect(page.getByRole('heading', { level: 1, name: view.heading })).toHaveCount(
    1,
  );
  if (view.label === '项目') {
    await expect(page.locator('h1').filter({ hasText: /^项目$/ })).toHaveCount(1);
  }
  await expect(panel).toHaveCount(1);
  await expect(panel).toBeVisible();
  await expect(view.keyControl(page)).toBeVisible();
  await expectOneVisibleActiveMainNavigation(page);
  await expectNoUnexpectedHorizontalOverflow(page);
  await expectElementWithinHorizontalViewport(
    page,
    page.locator('.tl-window'),
    '应用 shell',
  );
  await expectElementWithinHorizontalViewport(page, panel, `${view.label} 主模块`);
}

test.describe('UI structural invariants', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await bootstrapLocalAdapterWorkspace(
      page,
      `threadline.ui-structure.${testInfo.testId}`,
    );
  });

  test('keeps each primary workspace view singular, active, and horizontally contained', async ({
    page,
  }) => {
    for (const view of primaryWorkspaceViews) {
      await openWorkspaceSection(page, view.label);
      await expectPrimaryViewContract(page, view);
    }
  });

  test('keeps the highlighter color popover fully inside the viewport', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /选择颜色/ }).click();
    const popover = page.getByRole('dialog', { name: '荧光笔颜色' });
    await expect(popover).toHaveCount(1);
    await expectElementFullyWithinViewport(page, popover, '荧光笔颜色 Popover');
  });
});
