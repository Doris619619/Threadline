/**
 * @fileoverview 覆盖 Threadline 关键用户流程的浏览器端到端测试。
 */

import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

const frozenLocalNow = '2026-08-23T12:00:00+08:00';

/**
 * 用真实鼠标指针拖动明确的任务拖拽柄，覆盖桌面 WebView2 使用的 Pointer Events 路径。
 */
async function dragTaskWithMouse(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('任务拖拽源或落点不可见。');

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + Math.min(24, targetBox.width / 2),
    targetBox.y + Math.min(24, targetBox.height / 2),
    {
      steps: 12,
    },
  );
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  const seedKey = `threadline.e2e.seeded.${test.info().testId}`;
  await page.clock.install({ time: new Date(frozenLocalNow) });
  await page.addInitScript((key) => {
    // addInitScript 会在 reload 时再次运行；用 sessionStorage 确保只清理本用例首次导航。
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, 'true');
    // 每个 browser context 以固定 seed 开始，避免前一用例污染任务、Daily 和日期断言。
    for (const key of [
      'threadline.tasks.v1',
      'threadline.projects.v1',
      'threadline.daily-by-date.v1',
      'threadline.daily-templates.v1',
      'threadline.daily-history.v1',
      'threadline.history.v1',
      'threadline.close-records.v1',
      'threadline.annotations.v1',
      'threadline.annotations.v2',
      'threadline.annotation-highlight-color.v1',
      'threadline.workstation.v1',
      'threadline.workspace.v1',
      'threadline.rhythm.v1',
    ])
      window.localStorage.removeItem(key);
    window.localStorage.removeItem('threadline.desktop-mode.v2');
    window.localStorage.removeItem('threadline.desktop-mode-before-floating.v2');
    window.localStorage.removeItem('threadline.desktop-mode.v3');
    window.localStorage.removeItem('threadline.desktop-window-states.v3');
    window.localStorage.removeItem('threadline.desktop-last-compact-mode.v3');
    window.localStorage.removeItem('threadline.desktop-compact-presentation.v3');
  }, seedKey);
  await page.goto('/');
  await page.getByRole('heading', { name: '我的工作台' }).waitFor();
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(100);
});

/** 进入独立记录页，供任务流转与收尾历史流程复用。 */
async function openRecords(page: Page) {
  await openWorkspaceSection(page, '记录');
}

/** 进入设置的数据分类，供回收站恢复与保留期流程复用。 */
async function openSettingsData(page: Page) {
  await openWorkspaceSection(page, '设置');
}

/** 根据当前断点选择可见的桌面侧栏或移动底栏，不依赖重复导航 DOM 的角色查询顺序。 */
async function openWorkspaceSection(page: Page, label: string) {
  const desktopTarget = page
    .getByLabel('主导航', { exact: true })
    .getByRole('button', { name: label, exact: true });
  if (await desktopTarget.isVisible()) {
    await desktopTarget.click();
    return;
  }
  const mobileNavigation = page.getByLabel('移动端主导航', { exact: true });
  if (['首页', '日历', '项目', '洞察'].includes(label)) {
    await mobileNavigation.getByRole('button', { name: label, exact: true }).click();
    return;
  }
  await mobileNavigation.getByRole('button', { name: '更多', exact: true }).click();
  await mobileNavigation.getByRole('button', { name: label, exact: true }).click();
}

test('gives every workspace destination a distinct working page', async ({ page }) => {
  await openWorkspaceSection(page, '日历');
  await expect(page.getByTestId('calendar-panel')).toBeVisible();
  await expect(page.getByText('项目投入热力')).toBeVisible();

  await openWorkspaceSection(page, '项目');
  await expect(page.locator('.project-panel')).toBeVisible();

  await openWorkspaceSection(page, '洞察');
  await expect(page.getByTestId('insights-panel')).toBeVisible();
  await expect(page.getByText('工作投入趋势')).toBeVisible();

  await openWorkspaceSection(page, '记录');
  await expect(page.getByTestId('records-panel')).toBeVisible();

  await openWorkspaceSection(page, '节律');
  await expect(page.getByTestId('rhythm-panel')).toBeVisible();

  await openWorkspaceSection(page, '设置');
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '回收站', exact: true }),
  ).toBeVisible();
});

test('uses direct three-state entries and keeps workstation membership independent from tasks', async ({
  page,
}) => {
  await expect(
    page.getByRole('button', { name: '迷你今日', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '工作站', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '窗口模式' })).toHaveCount(0);

  await page.getByRole('button', { name: '迷你今日', exact: true }).click();
  await expect(page.getByTestId('mini-today-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: '今日日程' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '无时间待办' })).toBeVisible();
  await page.getByRole('button', { name: '加入工作站邮件处理' }).click();
  await page.getByRole('button', { name: '工作站', exact: true }).click();
  await expect(page.getByTestId('workstation-panel')).toContainText('邮件处理');
  await page.getByRole('button', { name: '从工作站移除邮件处理' }).click();
  await expect(page.getByTestId('workstation-panel')).not.toContainText('邮件处理');
  await page.getByRole('button', { name: '打开完整工作台' }).click();
  await expect(page.getByRole('checkbox', { name: '完成邮件处理' })).toBeVisible();
});

test('clears only workstation references and restores the compact view from edge tab', async ({
  page,
}) => {
  await page.getByRole('button', { name: '工作站', exact: true }).click();
  await page.getByRole('button', { name: '今日', exact: true }).click();
  await page.getByRole('button', { name: '加入工作站邮件处理' }).click();
  await page.getByRole('button', { name: '工作站', exact: true }).click();
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await expect(page.getByTestId('workstation-panel')).not.toContainText('邮件处理');
  await page.getByRole('button', { name: '打开完整工作台' }).click();
  await expect(page.getByRole('checkbox', { name: '完成邮件处理' })).toBeVisible();
  await page.getByRole('button', { name: '迷你今日', exact: true }).click();
  await page.getByRole('button', { name: '收起', exact: true }).click();
  const edgeTab = page.getByRole('button', { name: '展开迷你今日' });
  await expect(edgeTab).toBeVisible();
  await edgeTab.hover();
  await expect(page.getByTestId('mini-today-panel')).toBeVisible();
});

test('keeps compact labels in one line and creates tasks from both Mini add controls', async ({
  page,
}) => {
  await page.getByRole('button', { name: '迷你今日', exact: true }).click();
  const scheduleSection = page.locator('.compact-section').first();
  const quickSection = page.locator('.compact-section').nth(1);

  await scheduleSection.getByRole('button', { name: '添加', exact: true }).click();
  await page.getByLabel('紧凑新增开始时间').fill('09:00');
  await page.getByLabel('紧凑新增结束时间').fill('10:00');
  await page.getByLabel('紧凑新增日程任务').fill('紧凑日程任务');
  await page.getByRole('button', { name: '保存日程任务' }).click();
  await expect(scheduleSection).toContainText('紧凑日程任务');

  await quickSection.getByRole('button', { name: '添加', exact: true }).click();
  await page.getByLabel('紧凑新增待办任务').fill('紧凑待办任务');
  await page.getByRole('button', { name: '保存待办任务' }).click();
  await expect(quickSection).toContainText('紧凑待办任务');

  const label = scheduleSection.locator('.compact-task-label').first();
  await expect(label).toHaveCSS('display', 'flex');
  await expect(label.locator('.tl-project-tag')).toBeVisible();
  await expect(label.locator('strong')).toBeVisible();
});

test.describe('desktop task drag scheduling', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '任务拖放仅承诺桌面鼠标操作。');
  });

  test('moves an unscheduled task into the schedule as persisted pending time', async ({
    page,
  }) => {
    const quickTask = page.locator('.quick-task-row').filter({ hasText: '取快递' });
    const schedulePanel = page.locator('.schedule-panel');

    await dragTaskWithMouse(
      page,
      quickTask.getByRole('button', { name: '拖动取快递' }),
      schedulePanel,
    );

    const pendingTask = schedulePanel
      .locator('.timeline-row')
      .filter({ hasText: '取快递' });
    await expect(pendingTask).toBeVisible();
    await expect(pendingTask.locator('.timeline-time-input')).toBeFocused();

    await page.reload();
    const persistedPendingTask = page
      .locator('.schedule-panel .timeline-row')
      .filter({ hasText: '取快递' });
    await expect(persistedPendingTask).toBeVisible();
    await expect(page.locator('.schedule-panel .timeline-row').first()).toContainText(
      '取快递',
    );

    await persistedPendingTask.locator('.timeline-time').click();
    const timeInput = persistedPendingTask.locator('.timeline-time-input');
    await timeInput.fill('09:00');
    await timeInput.press('Enter');
    await expect(persistedPendingTask.locator('.timeline-time')).toHaveText('09:00');
    await page.reload();
    await expect(
      page
        .locator('.schedule-panel .timeline-row')
        .filter({ hasText: '取快递' })
        .locator('.timeline-time'),
    ).toHaveText('09:00');
  });

  test('moves a scheduled task back to quick tasks and clears scheduling state', async ({
    page,
  }) => {
    const scheduledTask = page.locator('.timeline-row').filter({ hasText: '邮件处理' });
    const scheduledHandle = scheduledTask.getByRole('button', { name: /拖动邮件处理/ });
    await scheduledHandle.scrollIntoViewIfNeeded();
    await dragTaskWithMouse(page, scheduledHandle, page.locator('.quick-panel'));
    await expect(
      page.locator('.quick-task-row').filter({ hasText: '邮件处理' }),
    ).toBeVisible();
    await expect(
      page.locator('.timeline-row').filter({ hasText: '邮件处理' }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.locator('.quick-task-row').filter({ hasText: '邮件处理' }),
    ).toBeVisible();
    await expect(
      page.locator('.timeline-row').filter({ hasText: '邮件处理' }),
    ).toHaveCount(0);
  });

  test('locks drag only while an annotation tool is active', async ({ page }) => {
    const quickTask = page.locator('.quick-task-row').filter({ hasText: '取快递' });
    const dragHandle = quickTask.getByRole('button', { name: '拖动取快递' });
    await expect(dragHandle).toBeEnabled();

    await page.getByRole('button', { name: '荧光笔' }).click();
    await expect(dragHandle).toBeDisabled();

    await page.getByRole('button', { name: '选择模式' }).click();
    await expect(dragHandle).toBeEnabled();
  });
});

test('creates a timed task from explicit start and end time inputs', async ({
  page,
}) => {
  const schedule = page.locator('.schedule-panel');
  await schedule.getByRole('button', { name: '添加', exact: true }).click();
  await schedule.getByLabel('开始时间').fill('14:20');
  await schedule.getByLabel('结束时间').fill('15:30');
  await schedule.getByPlaceholder('任务名称（按 Enter 保存）').fill('整理研究笔记');
  await schedule.getByTitle('保存任务').click();
  await expect(
    page.locator('.timeline-row').filter({ hasText: '整理研究笔记' }),
  ).toContainText('1h10min');
});

test('creates an unscheduled task from the inline quick-task row', async ({ page }) => {
  const quickPanel = page.locator('.quick-panel');
  await quickPanel.getByRole('button', { name: '添加', exact: true }).click();
  await quickPanel.getByPlaceholder('待办内容（按 Enter 保存）').fill('订购实验耗材');
  await quickPanel.getByTitle('保存待办').click();
  const row = page.locator('.quick-task-row').filter({ hasText: '订购实验耗材' });
  await expect(row).toBeVisible();
});

test('formats actual minutes on a timed task', async ({ page }) => {
  const schedule = page.locator('.schedule-panel');
  await schedule.getByRole('button', { name: '添加', exact: true }).click();
  await schedule.getByLabel('开始时间').fill('12:00');
  await schedule.getByLabel('结束时间').fill('13:30');
  await schedule.getByPlaceholder('任务名称（按 Enter 保存）').fill('标注访谈记录');
  await schedule.getByPlaceholder('实际耗时').fill('90');
  await schedule.getByTitle('保存任务').click();
  await expect(
    page.locator('.timeline-row').filter({ hasText: '标注访谈记录' }),
  ).toContainText('1h30min1h30min');
});

test('completion can be toggled without a dialog', async ({ page }) => {
  const task = page.getByRole('checkbox', { name: '完成邮件处理' });
  await task.check();
  await expect(task).toBeChecked();
  await task.uncheck();
  await expect(task).not.toBeChecked();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('does not offer incomplete-work transitions for a completed task', async ({ page }) => {
  const completed = page.locator('.timeline-row').filter({ hasText: '领域论文' });
  await completed.getByRole('button', { name: '领域论文更多操作' }).click();

  await expect(completed.getByRole('button', { name: '移期', exact: true })).toHaveCount(0);
  await expect(completed.getByRole('button', { name: '待安排', exact: true })).toHaveCount(0);
  await expect(completed.getByRole('button', { name: '放弃', exact: true })).toHaveCount(0);
  await expect(completed.getByRole('button', { name: '删除', exact: true })).toBeVisible();
});

test('persists task changes and navigates across dates', async ({ page }) => {
  const task = page.getByRole('checkbox', { name: '完成邮件处理' });
  await task.check();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '完成邮件处理' })).toBeChecked();
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(page.getByText('2026-08-24　周一')).toBeVisible();
  await expect(page.getByText('还没有待安排事项。')).toBeVisible();
  await page.getByRole('button', { name: '前一天' }).click();
  await expect(page.getByRole('checkbox', { name: '完成邮件处理' })).toBeChecked();
});

test('keeps drawn date annotations on their original day after navigation and reload', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '批注绘制使用桌面鼠标路径。');
  await page.getByRole('button', { name: '荧光笔' }).click();
  const canvas = page.locator('.tl-annotation-layer');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('批注画布不可见。');
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 70, { steps: 8 });
  await page.mouse.up();
  const persistedStrokes = page.locator(
    '.tl-annotation-layer path[data-annotation-date]',
  );
  await expect(persistedStrokes).toHaveCount(1);
  await expect(persistedStrokes).toHaveAttribute('data-annotation-date', '2026-08-23');
  await page.waitForFunction(() => {
    const stored = window.localStorage.getItem('threadline.annotations.v2');
    return Boolean(stored && JSON.parse(stored).length);
  });

  await page.getByRole('button', { name: '选择模式' }).click();
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(persistedStrokes).toHaveCount(0);
  await page.getByRole('button', { name: '前一天' }).click();
  await expect(persistedStrokes).toHaveCount(1);
  await page.reload();
  await expect(
    page.locator('.tl-annotation-layer path[data-annotation-date]'),
  ).toHaveCount(1);
});

test('uses the selected highlighter color for cursor, saved strokes, and reload preference', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '荧光笔绘制使用桌面鼠标路径。');
  await page.getByRole('button', { name: /选择颜色/ }).click();
  await page.getByRole('radio', { name: '蓝色' }).click();
  const canvas = page.locator('.tl-annotation-layer');
  await expect(canvas).toHaveCSS('cursor', /highlighter\.svg/);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('批注画布不可见。');
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 80, { steps: 4 });
  await page.mouse.up();
  const stroke = page
    .locator('.tl-annotation-layer path[data-annotation-date]')
    .first();
  await expect(stroke).toHaveAttribute('stroke', 'rgba(82, 170, 255, 0.38)');
  await page.reload();
  await expect(page.getByRole('button', { name: '选择颜色，当前蓝色' })).toBeVisible();

  await page.getByRole('button', { name: '选择颜色，当前蓝色' }).click();
  await page.getByRole('radio', { name: '黄色' }).click();
  await expect(page.getByRole('button', { name: '荧光笔' })).toHaveClass(/is-active/);
  await page.mouse.move(box.x + 55, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 145, { steps: 4 });
  await page.mouse.up();
  await expect(
    page.locator('.tl-annotation-layer path[data-annotation-date]').last(),
  ).toHaveAttribute('stroke', 'rgba(255, 225, 53, 0.42)');
  await page.reload();
  await expect(page.getByRole('button', { name: '选择颜色，当前黄色' })).toBeVisible();
});

test('keeps all timed task creation controls visible in a compact desktop schedule', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '新增日程行仅出现在完整桌面工作台。');
  await page.setViewportSize({ width: 1280, height: 840 });
  const schedule = page.locator('.schedule-panel');
  await schedule.getByRole('button', { name: '添加', exact: true }).click();
  const taskInput = schedule.getByPlaceholder('任务名称（按 Enter 保存）');
  const projectSelect = schedule.locator('.project-inline-select');
  const plannedInput = schedule.getByPlaceholder('45min');
  const actualInput = schedule.getByPlaceholder('实际耗时');
  const plannedHeading = schedule.locator('.timeline-col-planned');
  const actualHeading = schedule.locator('.timeline-col-actual');
  const timeline = schedule.locator('.timeline-scroll');
  const save = schedule.getByTitle('保存任务');
  const cancel = schedule.getByTitle('取消');
  const taskBox = await taskInput.boundingBox();
  const projectBox = await projectSelect.boundingBox();
  const plannedInputBox = await plannedInput.boundingBox();
  const actualInputBox = await actualInput.boundingBox();
  const plannedHeadingBox = await plannedHeading.boundingBox();
  const actualHeadingBox = await actualHeading.boundingBox();
  const timelineBox = await timeline.boundingBox();
  const saveBox = await save.boundingBox();
  const cancelBox = await cancel.boundingBox();
  if (
    !taskBox ||
    !projectBox ||
    !plannedInputBox ||
    !actualInputBox ||
    !plannedHeadingBox ||
    !actualHeadingBox ||
    !timelineBox ||
    !saveBox ||
    !cancelBox
  )
    throw new Error('新增日程字段不可见。');
  expect(taskBox.width).toBeGreaterThanOrEqual(120);
  expect(projectBox.width).toBeLessThanOrEqual(64);
  expect(plannedInputBox.width).toBeGreaterThanOrEqual(68);
  expect(actualInputBox.width).toBeGreaterThanOrEqual(68);
  expect(Math.abs(plannedHeadingBox.x - plannedInputBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actualHeadingBox.x - actualInputBox.x)).toBeLessThanOrEqual(1);
  expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(
    timelineBox.x + timelineBox.width,
  );
  expect(cancelBox.x + cancelBox.width).toBeLessThanOrEqual(
    timelineBox.x + timelineBox.width,
  );
  await expect(timeline).toHaveCSS('overflow-x', 'auto');
});

test('starts the full workspace with a wider schedule column', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '初始分栏仅在完整桌面工作台生效。');
  await page.setViewportSize({ width: 1440, height: 900 });
  const scheduleBox = await page.locator('.schedule-panel').boundingBox();
  const sideBox = await page.locator('.side-column').boundingBox();
  if (!scheduleBox || !sideBox) throw new Error('完整工作台分栏不可见。');
  expect(scheduleBox.width / sideBox.width).toBeGreaterThan(1.7);
});

test('keeps every highlighter color option in stable swatch label and check slots', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '批注菜单布局在完整桌面工作台验收。');
  await page.getByRole('button', { name: /选择颜色/ }).click();
  const options = page.getByRole('radio');
  const optionBoxes = await options.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().toJSON()),
  );
  expect(optionBoxes).toHaveLength(5);
  expect(new Set(optionBoxes.map((box) => Math.round(box.height)))).toEqual(
    new Set([30]),
  );

  await page.getByRole('radio', { name: '绿色' }).click();
  await page.getByRole('button', { name: /选择颜色，当前绿色/ }).click();
  const selected = page.locator('.annotation-color-option.is-selected');
  const [swatch, label, check] = await Promise.all([
    selected.locator('.annotation-color-option-swatch').boundingBox(),
    selected.locator('.annotation-color-option-label').boundingBox(),
    selected.locator('.annotation-color-option-check').boundingBox(),
  ]);
  if (!swatch || !label || !check) throw new Error('绿色菜单选项布局不可见。');
  expect(Math.round(swatch.width)).toBe(18);
  expect(Math.round(swatch.height)).toBe(18);
  expect(label.x).toBeGreaterThan(swatch.x);
  expect(check.x).toBeGreaterThan(label.x);
});

test('reopens the cached PWA offline without returning HTML for a Next script', async (
  { browser }: { browser: Browser },
  testInfo: { project: { name: string } },
) => {
  test.skip(testInfo.project.name !== 'desktop', '离线缓存由 Desktop Chromium 回归覆盖。');
  const context = await browser.newContext({
    serviceWorkers: 'allow',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.getByRole('heading', { name: '我的工作台' }).waitFor();
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const scriptUrl = await page.evaluate(() => {
      const entry = performance
        .getEntriesByType('resource')
        .map((item) => item.name)
        .find((name) => name.includes('/_next/') && name.endsWith('.js'));
      if (!entry) throw new Error('未找到 Next JavaScript 资源。');
      return entry;
    });

    await context.setOffline(true);
    const asset = await page.evaluate(async (url) => {
      const response = await fetch(url);
      return {
        contentType: response.headers.get('content-type'),
        prefix: (await response.text()).slice(0, 32),
      };
    }, scriptUrl);
    expect(asset.contentType).toContain('javascript');
    expect(asset.prefix).not.toContain('<!doctype html');
    await page.reload();
    await expect(page.getByRole('heading', { name: '我的工作台' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('creates a fresh Daily instance for another date', async ({ page }) => {
  await expect(
    page.getByRole('checkbox', { name: '完成 Daily 听力训练' }),
  ).toBeChecked();
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(
    page.getByRole('checkbox', { name: '完成 Daily 听力训练' }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: '完成 新词' }).check();
  await page.getByRole('button', { name: '前一天' }).click();
  await expect(
    page.getByRole('checkbox', { name: '完成 Daily 背单词' }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(page.getByRole('checkbox', { name: '完成 Daily 背单词' })).toBeChecked();
});

test('creates a task on the selected future date', async ({ page }) => {
  await page.getByRole('button', { name: '后一天' }).click();
  const quickPanel = page.locator('.quick-panel');
  await quickPanel.getByRole('button', { name: '添加', exact: true }).click();
  await quickPanel.getByPlaceholder('待办内容（按 Enter 保存）').fill('未来日期任务');
  await quickPanel.getByTitle('保存待办').click();
  await expect(quickPanel.getByText('未来日期任务', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '前一天' }).click();
  await expect(page.getByText('未来日期任务', { exact: true })).toHaveCount(0);
});

test('creates a Daily definition that appears on following dates', async ({ page }) => {
  await page.locator('.daily-add-btn').click();
  await page.getByLabel('新 Daily 名称').fill('晚间复盘');
  await page.locator('.daily-add-confirm').click();
  await expect(page.getByText('晚间复盘', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(page.getByText('晚间复盘', { exact: true })).toBeVisible();
});

test('moves an item through planning and returns it to today', async ({ page }) => {
  await page.getByRole('button', { name: '邮件处理更多操作' }).click();
  await page.getByRole('button', { name: '待安排', exact: true }).click();
  await expect(page.getByLabel('邮件处理 DDL')).toBeVisible();
  await page.getByLabel('邮件处理 DDL').fill('2026-08-28T23:59');
  await page.getByRole('button', { name: '安排到今天', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '完成邮件处理' })).toBeVisible();
});

test('daily subtask completion completes its parent', async ({ page }) => {
  const child = page.getByRole('checkbox', { name: '完成 新词' });
  await child.check();
  await expect(page.getByRole('checkbox', { name: '完成 Daily 背单词' })).toBeChecked();
});

test('creates Daily under a selected project with a subtask', async ({ page }) => {
  await page.locator('.daily-add-btn').click();
  await page.getByLabel('新 Daily 名称').fill('阅读训练');
  await page.getByLabel('新 Daily 所属项目').selectOption('work');
  await page.locator('.daily-add-confirm').click();
  await expect(page.getByText('阅读训练', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑 Daily 阅读训练' }).click();
  await page.getByLabel('阅读训练新子任务').fill('整理笔记');
  await page.getByRole('button', { name: '+ 子任务' }).last().click();
  await expect(page.getByRole('checkbox', { name: '完成 整理笔记' })).toBeVisible();
  await page.getByLabel('阅读训练名称').fill('晨间阅读');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('晨间阅读', { exact: true })).toBeVisible();
});

test('records rescheduling and abandonment in history', async ({ page }) => {
  const pickup = page.locator('.quick-task-row').filter({ hasText: '取快递' });
  await pickup.getByRole('button', { name: '取快递更多操作' }).click();
  await pickup.getByRole('button', { name: '放弃', exact: true }).click();

  const email = page.locator('.timeline-row').filter({ hasText: '邮件处理' });
  await email.getByRole('button', { name: '邮件处理更多操作' }).click();
  await email.getByRole('button', { name: '移期', exact: true }).click();
  const reschedule = page.getByRole('dialog', { name: '移期任务' });
  await reschedule.getByRole('button', { name: '确认移期' }).click();
  await openRecords(page);
  await expect(page.getByText('已移期', { exact: true })).toBeVisible();
  await expect(page.getByText('放弃', { exact: true })).toHaveCount(1);
});

test('can choose a future date when rescheduling', async ({ page }) => {
  const email = page.locator('.timeline-row').filter({ hasText: '邮件处理' });
  await email.getByRole('button', { name: '邮件处理更多操作' }).click();
  await email.getByRole('button', { name: '移期', exact: true }).click();
  const reschedule = page.getByRole('dialog', { name: '移期任务' });
  await reschedule.getByLabel('移期日期').fill('2026-08-26');
  await reschedule.getByRole('button', { name: '确认移期' }).click();
  await page.getByRole('button', { name: '后一天', exact: true }).click();
  await page.getByRole('button', { name: '后一天', exact: true }).click();
  await page.getByRole('button', { name: '后一天', exact: true }).click();
  await expect(
    page.locator('.timeline-row').getByText('邮件处理', { exact: true }),
  ).toBeVisible();
});

test('deletes a task and restores it from trash', async ({ page }) => {
  const pickup = page.locator('.quick-task-row').filter({ hasText: '取快递' });
  await pickup.getByRole('button', { name: '取快递更多操作' }).click();
  await pickup.getByRole('button', { name: '删除', exact: true }).click();
  await openSettingsData(page);
  await expect(
    page.locator('.trash-panel').getByText('取快递', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await expect(page.getByText('回收站为空。')).toBeVisible();
});

test('purges trash entries older than thirty days on reload', async ({ page }) => {
  await page.evaluate(() => {
    const tasks = JSON.parse(
      window.localStorage.getItem('threadline.tasks.v1') ?? '[]',
    );
    tasks.push({
      id: 'expired-task',
      projectId: 'other',
      title: '过期删除任务',
      completed: false,
      status: 'trashed',
      deletedAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    window.localStorage.setItem('threadline.tasks.v1', JSON.stringify(tasks));
  });
  await page.reload();
  await openSettingsData(page);
  await expect(page.getByText('过期删除任务')).toHaveCount(0);
});

test('closes today and moves unfinished work into planning', async ({ page }) => {
  await page.getByRole('button', { name: '结束今天', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('select').first().selectOption('backlog');
  await dialog.getByRole('button', { name: '确认结束今天', exact: true }).click();
  const planning = page.locator('.planning-queue');
  await expect(planning).toContainText('邮件处理');
  await expect(planning.getByLabel('邮件处理 DDL')).toBeVisible();
  await expect(page.getByRole('button', { name: '今日已结束' })).toBeDisabled();
});

test('keeps closeout records in the history view', async ({ page }) => {
  await page.getByRole('button', { name: '结束今天', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '确认结束今天', exact: true })
    .click();
  await openRecords(page);
  await expect(page.getByText('结束今天', { exact: true })).toBeVisible();
  await expect(page.getByText('完成听力训练')).toBeVisible();
  await expect(page.getByText('收尾：移至明天', { exact: true }).first()).toBeVisible();
});

test('keeps postponed work in the original date task denominator', async ({ page }) => {
  await page.getByRole('button', { name: '结束今天', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '确认结束今天', exact: true })
    .click();
  await expect(page.locator('.metric-strip .tl-stat').first()).toContainText(
    /2\s*\/\s*8/,
  );
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(page.getByRole('checkbox', { name: '完成邮件处理' })).toBeVisible();
});

test('shows task and daily data in unified insight periods', async ({ page }) => {
  await openWorkspaceSection(page, '洞察');
  await expect(page.getByText('工作投入趋势')).toBeVisible();
  await expect(page.getByText('项目时间分布')).toBeVisible();
  await page.getByRole('button', { name: '本月', exact: true }).click();
  await expect(page.getByText('实际投入', { exact: true }).first()).toBeVisible();
});

test('edits a project and opens its compact project detail', async ({ page }) => {
  await openWorkspaceSection(page, '项目');
  await page.getByRole('button', { name: '【AI研究】' }).click();
  await expect(
    page.getByRole('heading', { name: 'AI研究', exact: true }),
  ).toBeVisible();
  const researchRow = page.locator('.project-row').filter({ hasText: 'AI研究' });
  await researchRow.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('AI研究项目名称').fill('AI 实验室');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('【AI 实验室】')).toBeVisible();
});
