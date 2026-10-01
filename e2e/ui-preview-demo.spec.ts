/** @fileoverview 从真实 Preview 验证演示交互、逐项项目下拉、手机边界、持久化与云端隔离。 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openWorkspaceSection } from './support/workspace';
import type { Task } from '@/types/domain';
import { projectTaskState } from '@/features/projects/project-task-rules';

/** 冷启动含动态业务模块及本地 hydration；CI trace 显示 WebKit 会超过 10s，后续操作仍用默认时限。 */
async function awaitDemoWorkspace(page: Page) {
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('演示模式说明')).toBeVisible();
}

/** 常规三项清单在实际明暗主题下保持轻量，日期可读、草稿可编辑，截图不使用压力测试标题。 */
test('keeps stage creation and project overview readable in both themes', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await awaitDemoWorkspace(page);
  for (const scheme of ['dark', 'light'] as const) {
    await openWorkspaceSection(page, '设置');
    await page.getByRole('button', { name: '外观', exact: true }).click();
    await page
      .getByRole('button', { name: scheme === 'dark' ? '深色' : '浅色', exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', scheme);
    await openWorkspaceSection(page, '计划');
    await page.getByRole('button', { name: '+ 新建阶段', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建阶段', exact: true });
    await dialog.getByLabel('阶段名称', { exact: true }).fill('国庆假期');
    if (page.viewportSize()!.width <= 760) {
      expect((await dialog.boundingBox())!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height * 0.8 + 1,
      );
      await page.screenshot({
        path: info.outputPath('stage-details-' + scheme + '.png'),
      });
      await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    }
    const input = dialog.getByLabel('阶段任务名称', { exact: true });
    for (const [title, project] of [
      ['整理课程笔记', '课程'],
      ['完成访学申请材料', '工作'],
      ['读完一本书', '生活'],
    ]) {
      await dialog
        .getByLabel('阶段任务项目', { exact: true })
        .selectOption({ label: project });
      await input.fill(title);
      await input.press('Enter');
    }
    await dialog
      .getByRole('list', { name: '阶段任务草稿' })
      .evaluate((el) => (el.scrollTop = 0));
    const title = dialog.getByLabel('任务草稿 1', { exact: true });
    const rowProject = dialog.getByLabel('任务草稿 1 项目', { exact: true });
    await rowProject.selectOption({ label: 'AI研究' });
    await expect(rowProject.locator('option:checked')).toHaveText('AI研究');
    await expect(
      dialog.getByLabel('任务草稿 2 项目', { exact: true }).locator('option:checked'),
    ).toHaveText('工作');
    await expect(
      dialog.getByLabel('阶段任务项目', { exact: true }).locator('option:checked'),
    ).toHaveText('生活');
    await rowProject.selectOption({ label: '课程' });
    expect(await title.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(
      true,
    );
    const footer = (await dialog.locator('footer').boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    const composer = (await dialog.locator('.stage-draft-composer').boundingBox())!;
    const project = (await dialog
      .getByLabel('阶段任务项目', { exact: true })
      .boundingBox())!;
    expect(composer.y + composer.height).toBeLessThanOrEqual(footer.y);
    expect(project.y + project.height).toBeLessThanOrEqual(footer.y);
    if (page.viewportSize()!.width <= 760)
      expect((await dialog.boundingBox())!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height * 0.8 + 1,
      );
    expect(
      (await new AxeBuilder({ page }).include('.stage-editor-dialog').analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath('stage-editor-' + scheme + '.png') });
    if (page.viewportSize()!.width <= 760 && scheme === 'dark') {
      const viewport = page.viewportSize()!;
      await page.setViewportSize({ width: viewport.width, height: 520 });
      await input.focus();
      await expect
        .poll(async () => (await dialog.boundingBox())!.height)
        .toBeLessThanOrEqual(417);
      const compactFooter = (await dialog.locator('footer').boundingBox())!;
      const compactInput = (await input.boundingBox())!;
      expect(compactFooter.y + compactFooter.height).toBeLessThanOrEqual(520);
      expect(compactInput.y + compactInput.height).toBeLessThanOrEqual(compactFooter.y);
      await page.screenshot({ path: info.outputPath('stage-editor-short.png') });
      await page.setViewportSize(viewport);
      await dialog.getByRole('button', { name: '上一步', exact: true }).click();
      await expect(dialog.getByLabel('阶段名称', { exact: true })).toHaveValue(
        '国庆假期',
      );
      await dialog.getByRole('button', { name: '下一步', exact: true }).click();
      await expect(
        dialog.getByRole('list', { name: '阶段任务草稿' }).getByRole('listitem'),
      ).toHaveCount(3);
      await expect(
        dialog.getByLabel('任务草稿 1 项目', { exact: true }).locator('option:checked'),
      ).toHaveText('课程');
    }
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '查看项目 其他', exact: true }).click();
    const detail = page.getByRole('region', { name: '项目任务 其他', exact: true });
    expect(
      (await new AxeBuilder({ page }).include('.project-detail').analyze()).violations,
    ).toEqual([]);
    expect(await detail.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(
      false,
    );
    await page.screenshot({
      path: info.outputPath('project-overview-' + scheme + '.png'),
    });
    await detail.getByRole('button', { name: '返回计划', exact: true }).click();
  }
});

/** 通过真正创建入口验证长草稿编辑、每项项目归属、同 Task 的项目汇总和状态过滤。 */
test('keeps the stage composer compact and projects aggregate the same tasks across views', async ({
  page,
}, info) => {
  await page.goto('/');
  await awaitDemoWorkspace(page);
  await openWorkspaceSection(page, '计划');
  await page.getByRole('button', { name: '+ 新建阶段', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建阶段', exact: true });
  await dialog.getByLabel('阶段名称', { exact: true }).fill('项目汇总验收');
  const flag = dialog.getByRole('checkbox', { name: '显示在首页', exact: true });
  await expect(flag).toBeChecked();
  const label = (await dialog.locator('.stage-visible-field').boundingBox())!;
  const check = (await dialog.locator('.stage-visible-check').boundingBox())!;
  expect(
    Math.abs(check.y + check.height / 2 - label.y - label.height / 2),
  ).toBeLessThan(2);
  if (page.viewportSize()!.width <= 380) {
    const dates = await dialog.locator('.stage-date-fields input').all();
    const start = (await dates[0].boundingBox())!;
    const end = (await dates[1].boundingBox())!;
    expect(end.y).toBeGreaterThan(start.y + start.height);
    expect(start.width).toBeGreaterThanOrEqual(200);
  }
  if (page.viewportSize()!.width <= 760)
    await dialog.getByRole('button', { name: '下一步', exact: true }).click();
  const input = dialog.getByLabel('阶段任务名称', { exact: true });
  const project = dialog.getByLabel('阶段任务项目', { exact: true });
  await project.selectOption({ label: '工作' });
  const workId = await project.inputValue();
  for (let i = 0; i < 16; i++) {
    if (i === 8) await project.selectOption({ label: '课程' });
    await input.fill('汇总任务 ' + i);
    await input.press('Enter');
    await expect(input).toBeFocused();
  }
  await expect(
    dialog.getByRole('list', { name: '阶段任务草稿' }).getByRole('listitem'),
  ).toHaveCount(16);
  const firstId = await dialog
    .getByLabel('任务草稿 1', { exact: true })
    .locator('..')
    .getAttribute('data-stage-draft-id');
  // 已收集任务可改项目再改回；身份及下一项选择不跟着变化。
  await dialog
    .getByLabel('任务草稿 1 项目', { exact: true })
    .selectOption({ label: 'AI研究' });
  await expect(project.locator('option:checked')).toHaveText('课程');
  await dialog
    .getByLabel('任务草稿 1 项目', { exact: true })
    .selectOption({ label: '工作' });
  expect(
    await dialog
      .getByLabel('任务草稿 1', { exact: true })
      .locator('..')
      .getAttribute('data-stage-draft-id'),
  ).toBe(firstId);
  const longTitle =
    '汇总任务：准备课程报告、整理访学材料，确认每项事情都保留在所属项目中。'.repeat(3);
  await dialog.getByLabel('任务草稿 1', { exact: true }).fill(longTitle);
  await input.click();
  const scroll = await dialog
    .getByRole('list', { name: '阶段任务草稿' })
    .evaluate((el) => ({ height: el.clientHeight, total: el.scrollHeight }));
  expect(scroll.total).toBeGreaterThan(scroll.height);
  const bounds = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  const footer = (await dialog.locator('footer').boundingBox())!;
  expect(footer.y + footer.height).toBeLessThanOrEqual(viewport.height);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(
    false,
  );
  if (viewport.width <= 380) {
    const title = (await dialog
      .getByLabel('任务草稿 1', { exact: true })
      .boundingBox())!;
    expect(title.width).toBeGreaterThanOrEqual(130);
  }
  const accessibility = await new AxeBuilder({ page })
    .include('.stage-editor-dialog')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('stage-editor.png') });
  await dialog.getByRole('button', { name: '创建阶段', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const snapshot = () =>
    page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem('threadline.preview-demo.v1:threadline.tasks.v1')!,
        ) as Task[],
    );
  const before = await snapshot();
  const staged = before.filter((task) => task.title.startsWith('汇总任务'));
  expect(staged).toHaveLength(16);
  expect(staged.find((task) => task.title === longTitle)?.id).toBe(firstId);
  expect(staged.filter((task) => task.projectId === workId)).toHaveLength(8);
  await page.getByRole('button', { name: '查看项目 工作', exact: true }).click();
  const detail = page.getByRole('region', { name: '项目任务 工作', exact: true });
  await expect(detail).toBeVisible();
  const allWork = before.filter((task) => task.projectId === workId);
  await expect(detail.locator('[data-project-task-id]')).toHaveCount(allWork.length);
  const row = detail.locator('[data-project-task-id="' + firstId + '"]');
  await row.getByRole('button', { name: '→ 今天', exact: true }).click();
  await expect(row.locator('time')).toHaveText('今天');
  await row.getByRole('checkbox').check();
  const after = await snapshot();
  expect(after.length).toBe(before.length);
  const original = after.find((task) => task.id === firstId)!;
  expect(original.completed).toBe(true);
  expect(original.projectId).toBe(workId);
  expect(original.stagePlanId).toBe(staged[0].stagePlanId);
  for (const [filter, label] of [
    ['waiting', '未安排'],
    ['scheduled', '已安排'],
    ['completed', '已完成'],
  ] as const) {
    await detail
      .getByRole('group', { name: '项目任务筛选' })
      .getByRole('button', { name: new RegExp('^' + label + ' ') })
      .click();
    await expect(detail.locator('[data-project-task-id]')).toHaveCount(
      after.filter(
        (task) => task.projectId === workId && projectTaskState(task) === filter,
      ).length,
    );
  }
  await detail
    .getByRole('group', { name: '项目任务筛选' })
    .getByRole('button', { name: /^全部 / })
    .click();
  await detail.getByLabel('搜索项目任务').fill('汇总任务');
  await expect(detail.locator('[data-project-task-id]')).toHaveCount(8);
  await detail.getByLabel('搜索项目任务').fill('');
  expect(
    (await new AxeBuilder({ page }).include('.project-detail').analyze()).violations,
  ).toEqual([]);
  expect(await detail.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(
    false,
  );
  await page.screenshot({ path: info.outputPath('project-detail.png') });
  await detail.getByRole('button', { name: '返回计划', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '查看项目 工作', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: '查看阶段 项目汇总验收', exact: true })
    .click();
  await page
    .getByLabel('阶段任务项目', { exact: true })
    .selectOption({ label: 'AI研究' });
  await page.getByLabel('添加阶段任务', { exact: true }).fill('追加到科研项目');
  await page.getByRole('button', { name: '+ 添加任务', exact: true }).click();
  const final = await snapshot();
  const added = final.find((task) => task.title === '追加到科研项目')!;
  expect(added.stagePlanId).toBe(original.stagePlanId);
  expect(added.projectId).not.toBe(workId);
  await page.getByRole('button', { name: '返回计划', exact: true }).click();
  await page.getByRole('button', { name: '查看项目 AI研究', exact: true }).click();
  const addedRow = page.locator('[data-project-task-id="' + added.id + '"]');
  await expect(addedRow).toBeVisible();
  await addedRow.getByRole('button', { name: '追加到科研项目', exact: true }).click();
  const editing = page.getByRole('dialog');
  await editing
    .getByRole('combobox', { name: '项目', exact: true })
    .selectOption({ label: '生活' });
  await editing.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editing).not.toBeVisible();
  await expect(addedRow).toHaveCount(0);
  const changed = await snapshot();
  expect(changed.length).toBe(final.length);
  expect(changed.find((task) => task.id === added.id)?.stagePlanId).toBe(
    added.stagePlanId,
  );
  await page.getByRole('button', { name: '返回计划', exact: true }).click();
  await page.getByRole('button', { name: '查看项目 生活', exact: true }).click();
  await expect(page.locator('[data-project-task-id="' + added.id + '"]')).toBeVisible();
});

/** 首开演示阶段与原 Task 共用身份，操作与刷新不访问云数据或旧本地任务。 */
test('keeps stage demo task identity and stage membership after scheduling and reload', async ({
  page,
}) => {
  await page.goto('/');
  await awaitDemoWorkspace(page);
  const stage = page.locator('.home-stage-card').filter({ hasText: '国庆假期' });
  await expect(stage.locator('.stage-task-row')).toHaveCount(16);
  const alignment = await stage
    .locator('.stage-task-row')
    .first()
    .evaluate((row) => {
      const check = row.querySelector('.tl-checkbox > span')!.getBoundingClientRect();
      const project = row.querySelector('.tl-project-tag')!.getBoundingClientRect();
      const title = row.querySelector<HTMLElement>('.stage-task-title')!;
      const titleBox = title.getBoundingClientRect();
      const style = getComputedStyle(title);
      return {
        checkCenter: check.top + check.height / 2,
        firstLineCenter:
          titleBox.top +
          parseFloat(style.paddingTop) +
          parseFloat(style.lineHeight) / 2,
        projectCenter: project.top + project.height / 2,
        projectRight: project.right,
        titleLeft: titleBox.left,
        extraMetadata: row.querySelectorAll('.plan-task-meta').length,
      };
    });
  expect(
    Math.abs(alignment.checkCenter - alignment.firstLineCenter),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(alignment.projectCenter - alignment.firstLineCenter),
  ).toBeLessThanOrEqual(2);
  expect(alignment.projectRight).toBeLessThanOrEqual(alignment.titleLeft);
  expect(alignment.extraMetadata).toBe(0);
  const snapshot = () =>
    page.evaluate(() =>
      JSON.parse(
        localStorage.getItem('threadline.preview-demo.v1:threadline.tasks.v1')!,
      ),
    );
  const before = await snapshot();
  const item = before.find(
    (task: { stagePlanId?: string; status: string }) =>
      task.stagePlanId === 'demo-stage-holiday' && task.status === 'waiting',
  );
  await stage
    .locator('[data-stage-task-id="' + item.id + '"]')
    .getByRole('button', { name: '→ 今天', exact: true })
    .click();
  await expect(
    page.locator('.schedule-panel').getByText(item.title, { exact: true }),
  ).toBeVisible();
  await expect(stage.locator('.stage-task-row')).toHaveCount(16);
  await page.reload();
  await awaitDemoWorkspace(page);
  await expect(stage.locator('.stage-task-row')).toHaveCount(16);
  const after = await snapshot();
  expect(after.length).toBe(before.length);
  expect(after.find((task: { id: string }) => task.id === item.id).stagePlanId).toBe(
    'demo-stage-holiday',
  );
  await openWorkspaceSection(page, '计划');
  await expect(page.getByRole('button', { name: '新建', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '+ 新建阶段', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '+ 新建项目', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '+ 新建 Daily', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '查看阶段 国庆假期', exact: true }),
  ).toBeVisible();
});

test('opens an interactive isolated demo and persists Daily and newly created tasks', async ({
  page,
}, info) => {
  const cloudRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (/supabase\.(co|in)|\/auth\/v1\/|\/rest\/v1\//.test(request.url()))
      cloudRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await awaitDemoWorkspace(page);
  const daily = page.getByRole('region', { name: 'Daily 算法训练', exact: true });
  await expect(
    daily.getByText('完成一道动态规划题并整理思路', { exact: true }),
  ).toBeVisible();
  await daily.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时').fill('18');
  await expect(daily.locator('textarea')).toHaveCount(0);
  await expect(daily.getByText('今日结果', { exact: true })).toHaveCount(0);
  await daily
    .getByRole('checkbox', { name: '完成 完成一道动态规划题并整理思路', exact: true })
    .check();
  await expect(
    daily.getByRole('checkbox', { name: '完成 Daily 算法训练' }),
  ).toBeChecked();
  await expect(page.locator('.daily-save-status:not(:empty)')).toHaveCount(0);
  await expect(
    page.locator('.daily-panel').getByRole('button', { name: /记录/ }),
  ).toHaveCount(0);

  const important = page.getByRole('region', { name: '重要待安排', exact: true });
  const normal = page.getByRole('region', { name: '普通待安排', exact: true });
  await expect(important.getByText('提交课程项目材料', { exact: true })).toBeVisible();
  await important.getByRole('button', { name: '添加重要事项' }).click();
  await page.getByLabel('重要事项内容').fill('演示：提交研究计划');
  await important.getByTitle('保存待办').click();
  const created = important
    .locator('.waiting-task-row')
    .filter({ hasText: '演示：提交研究计划' });
  await created.locator('.waiting-task-main').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('重要性').selectOption('normal');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(normal.getByText('演示：提交研究计划', { exact: true })).toBeVisible();

  const schedule = page.locator('.schedule-panel');
  await schedule.getByRole('button', { name: '添加', exact: true }).click();
  await schedule
    .getByPlaceholder('任务名称（按 Enter 保存）')
    .fill('演示：整理今日笔记');
  await schedule.getByTitle('保存任务').click();
  await expect(schedule.getByText('演示：整理今日笔记', { exact: true })).toBeVisible();
  await page.reload();
  await awaitDemoWorkspace(page);
  await expect(daily.locator('textarea')).toHaveCount(0);
  await expect(
    daily.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时'),
  ).toHaveValue('18');
  await expect(normal.getByText('演示：提交研究计划', { exact: true })).toBeVisible();
  await expect(schedule.getByText('演示：整理今日笔记', { exact: true })).toBeVisible();
  await daily.getByRole('checkbox', { name: '完成 Daily 算法训练' }).uncheck();
  await expect(
    daily.getByRole('checkbox', {
      name: '完成 完成一道动态规划题并整理思路',
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    daily.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时'),
  ).toHaveValue('18');
  await page.getByRole('button', { name: '后一天' }).click();
  await expect(
    daily.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时'),
  ).toHaveValue('');
  await page.getByRole('button', { name: '前一天' }).click();
  await expect(
    daily.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时'),
  ).toHaveValue('18');
  const storage = await page.evaluate(() => ({
    demo: localStorage.getItem('threadline.preview-demo.v1:threadline.tasks.v1'),
    legacy: localStorage.getItem('threadline.tasks.v1'),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
  expect(storage.demo).toContain('演示：整理今日笔记');
  expect(storage.legacy).toBeNull();
  expect(storage.overflow).toBe(false);
  expect(cloudRequests).toEqual([]);
  expect(errors).toEqual([]);
  for (const control of await daily
    .locator('.daily-check, input[type=number], button')
    .all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const parentCheck = (await daily
    .locator('.daily-parent .daily-check')
    .boundingBox())!;
  const childCheck = (await daily
    .locator('.daily-child-row .daily-check')
    .first()
    .boundingBox())!;
  expect(childCheck.x - parentCheck.x).toBeGreaterThanOrEqual(16);
  for (const name of await daily
    .locator('.daily-parent-title, .daily-child-name')
    .all()) {
    const overflow = await name.evaluate(
      (element) =>
        element.scrollWidth > element.clientWidth + 1 ||
        element.scrollHeight > element.clientHeight + 1,
    );
    expect(overflow).toBe(false);
  }
  const accessibility = await new AxeBuilder({ page })
    .include('.daily-panel')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await daily.screenshot({ path: info.outputPath('daily-group.png') });
  await page
    .locator('.daily-panel')
    .screenshot({ path: info.outputPath('daily-panel.png') });
  await page.screenshot({ path: info.outputPath('preview-demo.png'), fullPage: true });
});

/** 覆盖用户截图中的整页日程和收尾弹窗，检查原生日期输入在 iPhone 上的边界。 */
test('keeps scheduled metadata compact and close-day controls inside the viewport', async ({
  page,
}, info) => {
  await page.goto('/');
  await awaitDemoWorkspace(page);
  const row = page.locator('.timeline-row').filter({ hasText: '领域论文' });
  if (info.project.name !== 'preview-desktop') {
    const parts = await row
      .locator('.timeline-time, .task-duration-planned, .task-duration-actual')
      .evaluateAll((elements) =>
        elements.map((el) => ({
          y: el.getBoundingClientRect().y,
          width: el.getBoundingClientRect().width,
        })),
      );
    expect(parts).toHaveLength(3);
    expect(
      Math.max(...parts.map((p) => p.y)) - Math.min(...parts.map((p) => p.y)),
    ).toBeLessThanOrEqual(2);
  }
  await page
    .locator('.schedule-panel')
    .screenshot({ path: info.outputPath('schedule.png') });
  await row.getByRole('checkbox').uncheck();
  const finish = page.getByRole('button', { name: '结束今天', exact: true });
  await finish.scrollIntoViewIfNeeded();
  await expect(finish).toBeVisible();
  await page.screenshot({ path: info.outputPath('home-bottom.png') });
  const dailyMinutes = page.getByLabel('算法训练 完成一道动态规划题并整理思路实际耗时');
  await dailyMinutes.fill('-1');
  await finish.click();
  await expect(
    page.getByRole('dialog', { name: '结束今天', exact: true }),
  ).not.toBeVisible();
  await expect(page.locator('.daily-save-error')).toBeVisible();
  await dailyMinutes.fill('8');
  await finish.click();
  const dialog = page.getByRole('dialog', { name: '结束今天', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[type=date]')).toHaveCount(0);
  const select = dialog.getByRole('combobox').first();
  await select.selectOption('date');
  const date = dialog.locator('input[type=date]');
  await expect(date).toBeVisible();
  const bounds = await dialog.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      vw: innerWidth,
      vh: innerHeight,
      overflow: el.scrollWidth > el.clientWidth + 1,
    };
  });
  expect(bounds.x).toBeGreaterThanOrEqual(15);
  expect(Math.abs(bounds.x * 2 + bounds.width - bounds.vw)).toBeLessThanOrEqual(2);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(bounds.vh + 1);
  expect(bounds.overflow).toBe(false);
  for (const control of await dialog.locator('input,select,button').all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    const font = await control.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    if (await control.evaluate((el) => el.matches('input,select')))
      expect(font).toBeGreaterThanOrEqual(16);
  }
  const footer = (await dialog.locator('footer').boundingBox())!;
  expect(footer.y + footer.height).toBeLessThanOrEqual(bounds.vh);
  expect(
    (await new AxeBuilder({ page }).include('.close-dialog').analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('close-day.png') });
  await dialog.getByRole('button', { name: '稍后处理', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(finish).toBeEnabled();
  await finish.click();
  await select.selectOption('tomorrow');
  await dialog.getByRole('button', { name: '确认结束今天', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: '今日已结束', exact: true }),
  ).toBeDisabled();
});
