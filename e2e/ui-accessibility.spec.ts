/**
 * @fileoverview 用 axe 与少量键盘交互 smoke 拦截关键页面的严重无障碍回归。
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  bootstrapLocalAdapterWorkspace,
  openSeededTaskEditor,
  openWorkspaceSection,
} from './support/workspace';

/** 只将会阻断用户完成主要流程的 axe critical 与 serious 结果作为当前 CI 门禁。 */
const blockingImpacts = new Set(['critical', 'serious']);

type AxeViolationBaseline = Readonly<Record<string, number>>;

/**
 * local adapter 已验证的现存无障碍债务；每个 surface 的 rule 节点数增加或出现新 rule 都会失败。
 *
 * 这些数量不是规则禁用项：它们保留 axe 扫描结果，待产品样式与 Calendar ARIA 结构修复后应同步下调。
 */
const knownBlockingAxeBaseline: Readonly<Record<string, AxeViolationBaseline>> = {
  Workspace: { 'color-contrast': 2 },
  Calendar: {
    'aria-required-children': 1,
    'aria-required-parent': 42,
    'color-contrast': 15,
  },
  Projects: { 'color-contrast': 16 },
  Settings: { 'color-contrast': 2 },
  '编辑任务 Dialog': { 'color-contrast': 3 },
};

/** 将 axe 结果压缩为 rule id 到受影响节点数的映射，供稳定的 baseline 回归比较使用。 */
function countAxeViolationNodes(violations: Array<{ id: string; nodes: unknown[] }>) {
  return Object.fromEntries(
    violations.map((violation) => [violation.id, violation.nodes.length]),
  );
}

/**
 * 运行完整页面 axe 扫描，禁止新出现或超出已记录节点数的 critical/serious 违规。
 *
 * 已记录的债务仍由 axe 实际扫描和计数，避免因临时关闭 rule 而失去回归信号。
 */
async function expectNoNewBlockingAxeViolations(page: Page, surface: string) {
  const report = await new AxeBuilder({ page }).analyze();
  const blocking = report.violations.filter((violation) =>
    blockingImpacts.has(violation.impact ?? ''),
  );
  const actual = countAxeViolationNodes(blocking);
  const baseline = knownBlockingAxeBaseline[surface] ?? {};
  const regressed = Object.entries(actual).filter(
    ([rule, nodes]) => nodes > (baseline[rule] ?? 0),
  );
  const resolved = Object.entries(baseline).filter(
    ([rule, nodes]) => (actual[rule] ?? 0) < nodes,
  );
  const summary = Object.entries(actual)
    .map(([rule, nodes]) => `${rule} (${nodes} nodes; baseline ${baseline[rule] ?? 0})`)
    .join(', ');

  expect(
    regressed,
    `${surface} 出现新增或增长的 critical/serious axe 违规：${summary}`,
  ).toEqual([]);
  expect(
    resolved,
    `${surface} 的已记录 axe 债务已减少，请下调 knownBlockingAxeBaseline：${resolved
      .map(([rule]) => rule)
      .join(', ')}`,
  ).toEqual([]);
}

/**
 * 从页面起始焦点顺序中逐次按 Tab，确认键盘可以到达指定的主要操作，而不是仅用程序化 focus 掩盖问题。
 */
async function expectTabCanReach(page: Page, target: Locator, maximumTabs = 80) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (let attempt = 0; attempt < maximumTabs; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  throw new Error(`键盘 Tab 在 ${maximumTabs} 次内无法到达主要操作。`);
}

/**
 * 判断当前焦点是否仍被原生 modal Dialog 包含，避免 Tab 落到底层页面。
 */
async function expectFocusInsideDialog(dialog: Locator) {
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
}

test.describe('accessibility smoke', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await bootstrapLocalAdapterWorkspace(page, `threadline.a11y.${testInfo.testId}`);
  });

  test('does not add critical or serious axe violations on Workspace', async ({
    page,
  }) => {
    await expectNoNewBlockingAxeViolations(page, 'Workspace');
  });

  test('does not add critical or serious axe violations on Calendar', async ({
    page,
  }) => {
    await openWorkspaceSection(page, '日历');
    await expectNoNewBlockingAxeViolations(page, 'Calendar');
  });

  test('does not add critical or serious axe violations on Projects', async ({
    page,
  }) => {
    await openWorkspaceSection(page, '项目');
    await expectNoNewBlockingAxeViolations(page, 'Projects');
  });

  test('does not add critical or serious axe violations on Settings', async ({
    page,
  }) => {
    await openWorkspaceSection(page, '设置');
    await expectNoNewBlockingAxeViolations(page, 'Settings');
  });

  test('does not add critical or serious axe violations in the task editor Dialog', async ({
    page,
  }) => {
    await openSeededTaskEditor(page);
    await expectNoNewBlockingAxeViolations(page, '编辑任务 Dialog');
  });

  test('supports keyboard navigation, activation, and Escape dismissal for the native close-day dialog', async ({
    page,
  }) => {
    await expectTabCanReach(
      page,
      page.getByRole('link', { name: 'Threadline', exact: true }),
      2,
    );
    const calendar = page.getByRole('button', { name: '日历', exact: true });
    await calendar.focus();
    await expect(calendar).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: '日历' })).toBeVisible();

    await openWorkspaceSection(page, '首页');
    const finishDay = page.getByRole('button', { name: '结束今天', exact: true });
    await finishDay.focus();
    await expect(finishDay).toBeFocused();
    await page.keyboard.press('Enter');

    const dialog = page.locator('dialog.close-dialog');
    await expect(dialog).toBeVisible();
    await expectFocusInsideDialog(dialog);
    await page.keyboard.press('Tab');
    await expectFocusInsideDialog(dialog);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
