/**
 * @fileoverview 在 iPhone WebKit 中回归可文字录入控件的字号、viewport 与横向布局安全。
 */

import { expect, test, type Page } from '@playwright/test';
import { expectNoUnexpectedHorizontalOverflow } from './support/layout';
import {
  bootstrapLocalAdapterWorkspace,
  openProjectCreateDialog,
  openSeededTaskEditor,
  openWorkspaceSection,
} from './support/workspace';

type FontSizeFailure = {
  description: string;
  fontSize: string;
};

/**
 * 返回当前可见、启用且可输入文字的控件中字号低于 16px 的项。
 * checkbox、radio、range、color、hidden 与按钮类 input 不属于 iOS 自动放大的文本录入范围。
 */
async function findUndersizedTextControls(page: Page): Promise<FontSizeFailure[]> {
  return page.evaluate(() => {
    const excludedInputTypes = new Set([
      'button',
      'checkbox',
      'color',
      'hidden',
      'image',
      'radio',
      'range',
      'reset',
      'submit',
    ]);
    const controls = Array.from(
      document.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLElement
      >('input, select, textarea, [contenteditable]'),
    );

    return controls.flatMap((control) => {
      const inputType =
        control instanceof HTMLInputElement
          ? (control.getAttribute('type') ?? control.type).toLowerCase()
          : undefined;
      if (inputType && excludedInputTypes.has(inputType)) return [];
      if (
        control.getAttribute('contenteditable') === 'false' ||
        ('disabled' in control && control.disabled)
      ) {
        return [];
      }

      const style = window.getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      const isVisible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0;
      if (!isVisible || parseFloat(style.fontSize) >= 16) return [];

      return [
        {
          description: `${control.tagName.toLowerCase()}${control.className ? `.${String(control.className).trim().replaceAll(/\s+/g, '.')}` : ''}${control.getAttribute('aria-label') ? `[aria-label="${control.getAttribute('aria-label')}"]` : ''}`,
          fontSize: style.fontSize,
        },
      ];
    });
  });
}

/** 断言当前页面所有可见文本控件都已消除 iOS Safari 自动缩放的字号触发条件。 */
async function expectVisibleTextControlsAtLeast16px(page: Page, stage: string) {
  expect(
    await findUndersizedTextControls(page),
    `${stage} 存在小于 16px 的文字录入控件`,
  ).toEqual([]);
}

/** 验证真实 Next viewport 输出仍允许用户主动缩放，不以无障碍倒退掩盖聚焦缩放。 */
async function expectViewportKeepsUserZoom(page: Page) {
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport ?? '').not.toMatch(/maximum-scale\s*=\s*1(?:\.0+)?(?:\s|,|$)/i);
  expect(viewport ?? '').not.toMatch(/user-scalable\s*=\s*no/i);
}

/** 将当前完整 CSS 应用于正常流中的业务选择器探针，覆盖 local adapter 无法到达的登录门禁。 */
async function findUndersizedBusinessStyleProbes(
  page: Page,
): Promise<FontSizeFailure[]> {
  return page.evaluate(() => {
    const probe = document.createElement('section');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:absolute;left:0;top:0;width:320px;visibility:hidden;';
    probe.innerHTML = `
      <div class="daily-entry"><input type="number"></div>
      <div class="close-task"><select><option>移到明天</option></select><input type="date"></div>
      <div class="queue-row"><select><option>项目</option></select><input type="datetime-local"></div>
      <input class="tl-inline-input timeline-time-input">
      <select class="tl-inline-select"><option>项目</option></select>
      <div class="project-picker-new-form"><input></div>
      <div class="compact-add-row"><select><option>项目</option></select><input type="time"></div>
      <div class="auth-input-group"><input class="auth-text-input" type="email"></div>
      <textarea></textarea><div contenteditable="true"></div>
    `;
    document.body.append(probe);
    const failures = Array.from(
      probe.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLElement
      >('input, select, textarea, [contenteditable="true"]'),
    ).flatMap((control) => {
      const fontSize = window.getComputedStyle(control).fontSize;
      return parseFloat(fontSize) >= 16
        ? []
        : [{ description: control.outerHTML, fontSize }];
    });
    probe.remove();
    return failures;
  });
}

test.describe('iPhone text control zoom guard', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await bootstrapLocalAdapterWorkspace(
      page,
      `threadline.mobile-form-controls.${testInfo.testId}`,
    );
  });

  test('keeps dashboard inputs, inline editors, create rows, and close-day controls at 16px or above', async ({
    page,
  }) => {
    await expectViewportKeepsUserZoom(page);
    await expect(page.locator('.daily-entry input')).not.toHaveCount(0);
    await expectVisibleTextControlsAtLeast16px(page, '首页 Daily');

    const schedule = page.locator('.schedule-panel');
    await schedule.getByRole('button', { name: '添加', exact: true }).click();
    await expectVisibleTextControlsAtLeast16px(page, '今日日程新增行');

    const waitingPanel = page.locator('.waiting-panel');
    await waitingPanel.getByRole('button', { name: '添加', exact: true }).click();
    await expectVisibleTextControlsAtLeast16px(page, '待安排新增行');

    const seededTask = page.locator('.timeline-row').filter({ hasText: '邮件处理' });
    await seededTask.locator('.task-title').click();
    await expectVisibleTextControlsAtLeast16px(page, '普通任务行内标题编辑');
    await page.keyboard.press('Escape');

    await seededTask.locator('.task-project-cell .tl-clickable-cell').click();
    await page.getByRole('button', { name: '新增项目', exact: true }).click();
    await expectVisibleTextControlsAtLeast16px(
      page,
      '项目选择 Popover 的新增项目输入框',
    );

    await expectNoUnexpectedHorizontalOverflow(page);
  });

  test('keeps task, project, Daily, and analytics form surfaces at 16px or above', async ({
    page,
  }) => {
    await openSeededTaskEditor(page);
    await expectVisibleTextControlsAtLeast16px(page, '编辑任务 Dialog');
    await expectNoUnexpectedHorizontalOverflow(page);
    await page.getByRole('button', { name: '关闭', exact: true }).click();

    await page.getByRole('button', { name: '结束今天', exact: true }).click();
    await expectVisibleTextControlsAtLeast16px(page, '每日收尾 Dialog');
    await expectNoUnexpectedHorizontalOverflow(page);
    await page.getByRole('button', { name: '关闭', exact: true }).click();

    await openWorkspaceSection(page, '项目');
    await openProjectCreateDialog(page, '新建项目');
    await expectVisibleTextControlsAtLeast16px(page, '新建项目 Dialog');
    await expectNoUnexpectedHorizontalOverflow(page);
    await page.keyboard.press('Escape');

    await openProjectCreateDialog(page, '新建 Daily');
    await page.getByRole('button', { name: '+ 添加清单项', exact: true }).click();
    await expectVisibleTextControlsAtLeast16px(page, 'Daily 模板 Dialog');
    await expectNoUnexpectedHorizontalOverflow(page);
    await page.keyboard.press('Escape');

    await openWorkspaceSection(page, '洞察');
    await page.getByRole('button', { name: '自定义', exact: true }).click();
    await expect(page.locator('.insights-filters input[type="date"]')).not.toHaveCount(
      0,
    );
    await expectVisibleTextControlsAtLeast16px(page, '洞察日期筛选');
    await expectNoUnexpectedHorizontalOverflow(page);
  });

  test('keeps every known business selector, login input, textarea, and contenteditable probe above 16px', async ({
    page,
  }) => {
    expect(await findUndersizedBusinessStyleProbes(page)).toEqual([]);
  });
});
