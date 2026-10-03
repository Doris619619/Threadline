/** @fileoverview 独立 Preview 验证密集任务标签、原地时间持久化、首页折叠、大屏与三并行计时。 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openWorkspaceSection } from './support/workspace';

test('persists inline time and preserves the same task through scheduling/completion', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto('/');
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await openWorkspaceSection(page, '计划');
  await page
    .getByRole('button', { name: '查看阶段 多项目时间验收', exact: true })
    .click();
  const detail = page.getByTestId('stage-detail');
  const chart = detail.locator('.stage-time-panel');
  await expect(detail.locator('.stage-task-row')).toHaveCount(22);
  await expect(chart.locator('[data-stage-slice]')).toHaveCount(20);
  await expect(chart.locator('[data-stage-line]')).toHaveCount(20);
  await expect(chart.locator('[data-stage-label]')).toHaveCount(20);
  for (const scheme of ['light', 'dark']) {
    await page.evaluate((scheme) => {
      document.documentElement.dataset.colorScheme = scheme;
    }, scheme);
    await expect
      .poll(() =>
        chart.locator('[data-stage-label]').evaluateAll((labels) =>
          labels.every((a, i) =>
            labels.every((b, j) => {
              if (i === j) return true;
              const x = a.getBoundingClientRect(),
                y = b.getBoundingClientRect();
              return (
                x.right <= y.left + 1 ||
                y.right <= x.left + 1 ||
                x.bottom <= y.top + 1 ||
                y.bottom <= x.top + 1
              );
            }),
          ),
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include('.stage-time-panel').analyze())
        .violations,
    ).toEqual([]);
    await chart.screenshot({ path: info.outputPath('task-ring-' + scheme + '.png') });
  }
  await chart
    .getByRole('button', { name: '编辑 验收任务 2预计分钟', exact: true })
    .click();
  await chart.getByLabel('验收任务 2预计分钟').fill('65');
  await chart.getByLabel('验收任务 2预计分钟').press('Enter');
  await expect(chart.locator('[data-stage-slice]')).toHaveCount(21);
  await page.reload();
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await openWorkspaceSection(page, '计划');
  await page
    .getByRole('button', { name: '查看阶段 多项目时间验收', exact: true })
    .click();
  await expect(
    chart.getByRole('button', { name: '编辑 验收任务 2预计分钟', exact: true }),
  ).toHaveText('1h5min');
  await chart.getByRole('button', { name: '实际投入', exact: true }).click();
  await chart
    .getByRole('button', { name: '编辑 验收任务 2累计实际分钟', exact: true })
    .click();
  await chart.getByLabel('验收任务 2累计实际分钟').fill('10');
  await chart.getByRole('button', { name: '保存', exact: true }).click();
  const row = detail.locator('[data-stage-task-id="demo-stage-time-task-1"]');
  await expect(row.getByRole('button', { name: '→ 今天', exact: true })).toBeVisible();
  await row.getByRole('button', { name: '→ 今天', exact: true }).click();
  await expect(row.locator('time')).toHaveText('今天');
  await row.getByRole('checkbox').check();
  await chart.getByRole('button', { name: '剩余预计', exact: true }).click();
  await expect(
    chart.locator('[data-stage-slice="demo-stage-time-task-1"]'),
  ).toHaveCount(0);
  const stored = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('threadline.preview-demo.v1:threadline.tasks.v1')!,
    ).find((t: { id: string }) => t.id === 'demo-stage-time-task-1'),
  );
  expect(stored).toMatchObject({
    id: 'demo-stage-time-task-1',
    stagePlanId: 'demo-stage-time',
    plannedDurationMinutes: 65,
    actualDurationMinutes: 10,
    completed: true,
    status: 'active',
  });
});

test('runs three independent timers, resumes after reload and records completion once', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto('/');
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await page.clock.install();
  const timers = page.getByRole('region', { name: '任务计时器', exact: true });
  for (let i = 0; i < 3; i++) {
    await timers.getByRole('button', { name: '+ 任务计时器', exact: true }).click();
    await timers.getByLabel('计时任务').selectOption('demo-stage-time-task-' + i);
    if (i === 2) {
      await timers.getByLabel('计时方式').selectOption('down');
      await timers.getByLabel('倒计时分钟').fill('1');
    }
    await timers.getByRole('button', { name: '开始计时', exact: true }).click();
  }
  await expect(timers.locator('.task-timer')).toHaveCount(3);
  await expect(
    timers.getByRole('button', { name: '+ 任务计时器', exact: true }),
  ).toHaveCount(0);
  await page.clock.fastForward(35000);
  await timers
    .locator('.task-timer')
    .first()
    .getByRole('button', { name: '暂停', exact: true })
    .click();
  const pausedClock = await timers
    .locator('.task-timer')
    .first()
    .locator('time')
    .innerText();
  await page.clock.fastForward(35000);
  await expect(timers.locator('.task-timer').first().locator('time')).toHaveText(
    pausedClock,
  );
  await expect(timers.locator('.task-timer').nth(1).locator('time')).toHaveText(
    /^01:\d\d$/,
  );
  await expect(timers.locator('.task-timer').nth(2)).toContainText('倒计时已到时');
  await page.reload();
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await expect(timers.locator('.task-timer')).toHaveCount(3);
  await timers
    .locator('.task-timer')
    .first()
    .getByRole('button', { name: '继续', exact: true })
    .click();
  await page.clock.fastForward(30000);
  await timers
    .locator('.task-timer')
    .first()
    .getByRole('button', { name: '完成并记耗时', exact: true })
    .click();
  await expect(timers.locator('.task-timer')).toHaveCount(2);
  const stored = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('threadline.preview-demo.v1:threadline.tasks.v1')!,
    ).find((t: { id: string }) => t.id === 'demo-stage-time-task-0'),
  );
  expect(stored).toMatchObject({
    actualDurationMinutes: 1,
    completed: true,
    status: 'active',
  });
  await page.screenshot({ path: info.outputPath('home-timers.png') });
  expect(
    (await new AxeBuilder({ page }).include('.task-timers').analyze()).violations,
  ).toEqual([]);
});

test('keeps the home layout while switching the right column and using wide screen space', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  const schedule = page.locator('.schedule-panel');
  const side = page.locator('#home-side-column');
  const choice = page.getByRole('combobox', { name: '右栏显示内容', exact: true });
  await expect(choice).toHaveValue('tasks');
  await expect(schedule.locator('.stage-time-panel')).toHaveCount(0);
  await expect(page.locator('#home-side-tasks')).toBeVisible();
  const initialSchedule = (await schedule.boundingBox())!;
  await choice.selectOption('time');
  await expect(
    side.getByRole('region', { name: '当日时间分布', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#home-side-tasks')).not.toBeVisible();
  const switchedSchedule = (await schedule.boundingBox())!;
  expect(switchedSchedule.y).toBe(initialSchedule.y);
  expect(switchedSchedule.width).toBe(initialSchedule.width);
  if (page.viewportSize()!.width > 1050) {
    const rightBounds = (await side.boundingBox())!;
    expect(rightBounds.x).toBeGreaterThanOrEqual(
      initialSchedule.x + initialSchedule.width,
    );
    expect(rightBounds.y).toBe(initialSchedule.y);
  }
  const chart = side.locator('.stage-time-panel');
  await expect
    .poll(() =>
      chart.locator('.stage-time-metrics strong').evaluateAll((values) =>
        values.flatMap((value) => {
          const style = getComputedStyle(value);
          const height = value.getBoundingClientRect().height;
          return height <= parseFloat(style.lineHeight) + 1
            ? []
            : [
                {
                  text: value.textContent,
                  height,
                  lineHeight: style.lineHeight,
                  fontSize: style.fontSize,
                  width: value.getBoundingClientRect().width,
                },
              ];
        }),
      ),
    )
    .toEqual([]);
  await chart.getByRole('button', { name: '实际投入', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).include('#home-side-column').analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('home-right-ring.png') });
  await choice.selectOption('tasks');
  await expect(page.locator('#home-side-time')).not.toBeVisible();
  await choice.selectOption('time');
  await expect(
    chart.getByRole('button', { name: '实际投入', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(choice).toHaveValue('time');
  await expect(chart).toBeVisible();
  const before = (await page.locator('.schedule-panel').boundingBox())!.width;
  await page.getByRole('button', { name: '收起右栏', exact: true }).click();
  await expect(page.locator('#home-side-column')).not.toBeVisible();
  if (page.viewportSize()!.width > 1050)
    await expect
      .poll(async () => (await page.locator('.schedule-panel').boundingBox())!.width)
      .toBeGreaterThan(before + 200);
  await page.reload();
  await expect(page.locator('#home-side-column')).not.toBeVisible();
  await page.getByRole('button', { name: '展开右栏', exact: true }).click();
  await expect(choice).toHaveValue('time');
  await choice.selectOption('tasks');
  if (info.project.name === 'preview-desktop') {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await expect
      .poll(() =>
        page
          .locator('.timeline-row .task-project-trigger')
          .evaluateAll((nodes) =>
            nodes.every((n) => n.scrollWidth <= n.clientWidth + 1),
          ),
      )
      .toBe(true);
    expect(
      await page
        .locator('.timeline-row .task-duration-planned')
        .evaluateAll((nodes) => nodes.every((n) => n.scrollWidth <= n.clientWidth + 1)),
    ).toBe(true);
  }
  await expect(page.locator('.metric-strip .tl-stat')).toHaveCount(2);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('home-layout.png') });
});
