/** @fileoverview 独立 Preview 验证时间图、首页布局、三并行计时和不会写账本的到时续时流程。 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openWorkspaceSection, openTaskMenu } from './support/workspace';

const timerStorageKey = 'threadline.preview-demo.v1:threadline.task-timers.v1:local';
const taskStorageKey = 'threadline.preview-demo.v1:threadline.tasks.v1';
const entryStorageKey = 'threadline.preview-demo.v1:threadline.task-time-entries.v1';

/** load 早于工作区水合；只给真实日程面板的启动等待 30s，业务和几何断言仍用默认 5s。 */
async function waitForPreviewWorkspace(page: Page) {
  await expect(page.getByTestId('home-panel').locator('.schedule-panel')).toBeVisible({
    timeout: 30_000,
  });
}

/** 用三条有效本机计时恢复已到时场景；后续延长全部通过真实卡片操作，不改变任务或账本。 */
async function restoreExpiredCountdown(page: Page) {
  await page.clock.install({ time: new Date('2026-10-03T08:00:00Z') });
  await page.goto('/');
  await waitForPreviewWorkspace(page);
  const titles = await page.evaluate(
    ({ tasksKey, timersKey }) => {
      const tasks: { id: string; title: string }[] = JSON.parse(
        localStorage.getItem(tasksKey)!,
      );
      const selected = [0, 1, 2].map((index) => {
        const task = tasks.find((task) => task.id === 'demo-stage-time-task-' + index);
        if (!task) throw new Error(`演示缺少第 ${index + 1} 个计时任务`);
        return task;
      });
      const now = Date.now();
      localStorage.setItem(
        timersKey,
        JSON.stringify(
          selected.map((task, index) => ({
            id: 'extension-timer-' + index,
            taskId: task.id,
            title: task.title,
            mode: index === 0 ? 'down' : 'up',
            targetMs: 10 * 60000,
            elapsedMs: index === 0 ? 10 * 60000 : 2 * 60000,
            firstStartedAt: now - 10 * 60000,
            entryDate: '2026-10-03',
          })),
        ),
      );
      return selected.map((task) => task.title);
    },
    { tasksKey: taskStorageKey, timersKey: timerStorageKey },
  );
  await page.reload();
  await waitForPreviewWorkspace(page);
  await expect(page.locator('.task-timer')).toHaveCount(3);
  // 时钟安装在导航前并自然运行到水合结束；冻结点跟随当前时间，避免慢 CI 超过固定的 08:01。
  // 种子计时均已暂停，此处推进一分钟不产生额外耗时或账本写入。
  const freezeAt = await page.evaluate(() => Date.now() + 60_000);
  await page.clock.pauseAt(freezeAt);
  return titles;
}

/** 记录计时卡与页头的矩形；浮层打开、编辑及恢复都不能重排已经显示的三张卡。 */
async function readTimerLayout(page: Page) {
  return page.locator('.tl-header').evaluate((header) => ({
    height: header.getBoundingClientRect().height,
    cards: [...header.querySelectorAll('.task-timer')].map((card) => {
      const { x, y, width, height } = card.getBoundingClientRect();
      return { x, y, width, height };
    }),
  }));
}

/** 用实际文字矩形检查时钟不越过卡片边界，也不与同一行的操作按钮重叠。 */
async function expectTimerControlsFit(page: Page) {
  const fits = await page.locator('.task-timer').evaluateAll((cards) =>
    cards.every((card) => {
      const readout = card.querySelector('.task-timer-readout')!;
      const range = document.createRange();
      range.selectNodeContents(readout);
      const text = range.getBoundingClientRect();
      const actions = card
        .querySelector('.task-timer-actions')!
        .getBoundingClientRect();
      const bounds = card.getBoundingClientRect();
      return (
        text.left >= bounds.left &&
        text.right <= bounds.right - 8 &&
        (text.bottom <= actions.top || text.right <= actions.left - 2)
      );
    }),
  );
  expect(fits).toBe(true);
}

/** 对比真实持久化业务数据，不把计时器自己的本机保存误当成任务入账。 */
async function readTimerBusinessSnapshot(page: Page) {
  return page.evaluate(
    ({ tasksKey, entriesKey }) => ({
      tasks: localStorage.getItem(tasksKey),
      entries: localStorage.getItem(entriesKey),
    }),
    { tasksKey: taskStorageKey, entriesKey: entryStorageKey },
  );
}

test('countdown presets resume repeatedly without moving three cards or writing the task ledger', async ({
  page,
}, info) => {
  if (info.project.name === 'preview-desktop')
    await page.setViewportSize({ width: 1280, height: 800 });
  await restoreExpiredCountdown(page);
  const card = page.locator('.task-timer').first();
  const panel = page.getByRole('group', { name: '延长倒计时', exact: true });
  const layout = await readTimerLayout(page);
  const business = await readTimerBusinessSnapshot(page);
  const originalStart = await card.locator('.task-timer-date').innerText();
  if (info.project.name === 'preview-desktop') {
    expect(new Set(layout.cards.map((card) => card.y)).size).toBe(1);
    expect(layout.cards.every((card) => card.width === 188)).toBe(true);
  }
  await expect(card.locator('.task-timer-readout')).toHaveText('00:00:00');
  await expectTimerControlsFit(page);
  await card.getByRole('button', { name: '延长', exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/已用\s*10\s*分钟/);
  await expect(panel.getByRole('heading')).toHaveCount(0);
  await expect(panel).not.toContainText(originalStart);
  const presets = panel.locator('.task-timer-extension-presets button');
  await expect(presets).toHaveCount(4);
  expect(
    await presets.evaluateAll((buttons) =>
      buttons.every((button) => {
        const range = document.createRange();
        range.selectNodeContents(button);
        const text = range.getBoundingClientRect();
        const bounds = button.getBoundingClientRect();
        // 数字与单位属于两个 JSX 文本节点；同一行的文字矩形共享垂直区域。
        const fragments = [...range.getClientRects()];
        return (
          fragments.length > 0 &&
          Math.max(...fragments.map((rect) => rect.top)) <
            Math.min(...fragments.map((rect) => rect.bottom)) &&
          text.left >= bounds.left &&
          text.right <= bounds.right
        );
      }),
    ),
  ).toBe(true);
  expect(await readTimerLayout(page)).toEqual(layout);
  await panel.getByRole('button', { name: '5分钟', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(card.locator('.task-timer-readout')).toHaveText('00:05:00');
  await expect(card.locator('.task-timer-readout')).toHaveAttribute(
    'aria-label',
    '倒计时运行中',
  );
  expect(await readTimerLayout(page)).toEqual(layout);
  await expectTimerControlsFit(page);
  expect(await readTimerBusinessSnapshot(page)).toEqual(business);
  await page.clock.fastForward(5 * 60000);
  await expect(card.locator('.task-timer-readout')).toHaveText('00:00:00');
  await card.getByRole('button', { name: '延长', exact: true }).click();
  await expect(panel).toContainText(/已用\s*15\s*分钟/);
  await panel.getByRole('button', { name: '10分钟', exact: true }).click();
  await expect(card.locator('.task-timer-readout')).toHaveText('00:10:00');
  await expect(card.locator('.task-timer-date')).toHaveText(originalStart);
  expect(await readTimerLayout(page)).toEqual(layout);
  await expectTimerControlsFit(page);
  expect(await readTimerBusinessSnapshot(page)).toEqual(business);
  await page.screenshot({ path: info.outputPath('countdown-second-extension.png') });
});

test('countdown custom input confirms with Enter, cancels with Escape and fits a mobile bottom panel', async ({
  page,
}, info) => {
  await restoreExpiredCountdown(page);
  const card = page.locator('.task-timer').first();
  const panel = page.getByRole('group', { name: '延长倒计时', exact: true });
  const extend = card.getByRole('button', { name: '延长', exact: true });
  const layout = await readTimerLayout(page);
  const business = await readTimerBusinessSnapshot(page);
  await extend.click();
  await expect(panel).toBeVisible();
  const mobile = info.project.name !== 'preview-desktop';
  if (mobile) {
    const dimensions = await panel.evaluate((panel) => ({
      rect: panel.getBoundingClientRect().toJSON(),
      viewport: { width: innerWidth, height: innerHeight },
      buttons: [...panel.querySelectorAll('button')].map((button) =>
        button.getBoundingClientRect().toJSON(),
      ),
    }));
    expect(dimensions.rect.left).toBeGreaterThanOrEqual(0);
    expect(dimensions.rect.right).toBeLessThanOrEqual(dimensions.viewport.width);
    expect(dimensions.viewport.height - dimensions.rect.bottom).toBeLessThanOrEqual(40);
    expect(
      dimensions.buttons.every((rect) => rect.width >= 44 && rect.height >= 44),
    ).toBe(true);
  } else {
    const cardBox = (await card.boundingBox())!;
    expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(
      cardBox.y + cardBox.height + 4,
    );
  }
  expect(await readTimerLayout(page)).toEqual(layout);
  await page.screenshot({ path: info.outputPath('countdown-extension-panel.png') });
  await panel.getByRole('button', { name: '自定义', exact: true }).click();
  const input = panel.getByLabel('延长分钟', { exact: true });
  await expect(input).toBeFocused();
  if (mobile) {
    expect(
      await input.evaluate((input) => parseFloat(getComputedStyle(input).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await input.fill('7');
  await panel.getByRole('button', { name: '取消', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(extend).toBeFocused();
  await expect(card.locator('.task-timer-readout')).toHaveText('00:00:00');
  expect(await readTimerLayout(page)).toEqual(layout);
  expect(await readTimerBusinessSnapshot(page)).toEqual(business);
  await extend.click();
  await panel.getByRole('button', { name: '自定义', exact: true }).click();
  await input.fill('7');
  await input.press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(extend).toBeFocused();
  await expect(card.locator('.task-timer-readout')).toHaveText('00:00:00');
  expect(await readTimerLayout(page)).toEqual(layout);
  expect(await readTimerBusinessSnapshot(page)).toEqual(business);
  await extend.click();
  await panel.getByRole('button', { name: '自定义', exact: true }).click();
  await panel.getByLabel('延长分钟', { exact: true }).fill('1441');
  await panel.getByLabel('延长分钟', { exact: true }).press('Enter');
  await expect(panel.getByRole('alert')).toContainText('1—1440');
  await expect(panel.getByLabel('延长分钟', { exact: true })).toHaveValue('1441');
  expect(await readTimerBusinessSnapshot(page)).toEqual(business);
  await panel.getByLabel('延长分钟', { exact: true }).fill('7');
  await panel.getByLabel('延长分钟', { exact: true }).press('Enter');
  await expect(panel).not.toBeVisible();
  await expect(card.locator('.task-timer-readout')).toHaveText('00:07:00');
  expect(await readTimerLayout(page)).toEqual(layout);
  expect(await readTimerBusinessSnapshot(page)).toEqual(business);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});

/** 存储事件尚未送达旧卡片时，续时必须核对本机最新值，不能复活删除或覆盖其他窗口的保存意图。 */
for (const update of ['pending', 'running', 'removed'] as const) {
  test(`countdown extension respects a silently ${update} timer from another tab`, async ({
    page,
  }) => {
    await restoreExpiredCountdown(page);
    const card = page.locator('.task-timer').first();
    await card.getByRole('button', { name: '延长', exact: true }).click();
    const panel = page.getByRole('group', { name: '延长倒计时', exact: true });
    await expect(panel).toBeVisible();
    const business = await readTimerBusinessSnapshot(page);
    const expected = await page.evaluate(
      ({ update, timersKey, tasksKey }) => {
        const timers = JSON.parse(localStorage.getItem(timersKey)!);
        if (update === 'removed') timers.shift();
        else if (update === 'running') {
          timers[0] = { ...timers[0], targetMs: 20 * 60000, startedAt: Date.now() };
        } else {
          const tasks = JSON.parse(localStorage.getItem(tasksKey)!);
          timers[0] = {
            ...timers[0],
            pending: {
              original: tasks.find(
                (task: { id: string }) => task.id === timers[0].taskId,
              ),
              minutes: 10,
            },
          };
        }
        // 同页直接改 storage 不发事件，确定性模拟跨标签事件在用户点击之后才到达。
        const raw = JSON.stringify(timers);
        localStorage.setItem(timersKey, raw);
        return raw;
      },
      { update, timersKey: timerStorageKey, tasksKey: taskStorageKey },
    );
    await panel.getByRole('button', { name: '5分钟', exact: true }).click();
    await expect(panel).not.toBeVisible();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), timerStorageKey),
    ).toBe(expected);
    expect(await readTimerBusinessSnapshot(page)).toEqual(business);
    await expect(page.locator('.task-timer')).toHaveCount(update === 'removed' ? 2 : 3);
  });
}

/** 零值只留口径和时长，中心文字四角位于内圈内；任务标签和时长有不同颜色与字重。 */
test('keeps empty ring text clear of the ring and separates callout time from task names', async ({
  page,
}, info) => {
  await page.goto('/');
  await waitForPreviewWorkspace(page);
  await page
    .getByRole('combobox', { name: '右栏显示内容', exact: true })
    .selectOption('time');
  const chart = page.locator('#home-side-column .stage-time-panel');
  const callout = chart.locator('.stage-time-callout').first();
  await expect(callout).toBeVisible();
  for (const theme of ['blue', 'anya', 'classic', 'cottage']) {
    for (const scheme of ['light', 'dark']) {
      await page.evaluate(
        ({ theme, scheme }) => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.colorScheme = scheme;
        },
        { theme, scheme },
      );
      const styles = await callout.evaluate((node) => {
        const name = getComputedStyle(node.querySelector('span')!);
        const time = getComputedStyle(node.querySelector('small')!);
        return {
          nameColor: name.color,
          timeColor: time.color,
          nameWeight: name.fontWeight,
          timeWeight: time.fontWeight,
        };
      });
      expect(styles.timeColor).not.toBe(styles.nameColor);
      expect(Number(styles.timeWeight)).toBeGreaterThan(Number(styles.nameWeight));
    }
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'classic';
    document.documentElement.dataset.colorScheme = 'light';
  });
  await chart.screenshot({ path: info.outputPath('ring-callout-hierarchy.png') });
  await page.evaluate(() => {
    const key = 'threadline.preview-demo.v1:threadline.tasks.v1';
    const tasks = JSON.parse(localStorage.getItem(key)!);
    for (const task of tasks) task.plannedDurationMinutes = 0;
    localStorage.setItem(key, JSON.stringify(tasks));
  });
  await page.reload();
  await waitForPreviewWorkspace(page);
  await expect(chart.locator('.stage-time-center strong')).toHaveText('0min');
  await expect(chart.locator('.stage-time-center small')).toHaveCount(0);
  await expect(chart).not.toContainText('暂无预计时间');
  expect(
    await chart
      .locator('.stage-time-center-title')
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeGreaterThanOrEqual(11);
  for (const fontSize of ['', '200%']) {
    for (const width of [360, 280, 240]) {
      await chart.locator('.stage-time-visual').evaluate(
        async (node, { width, fontSize }) => {
          (node as HTMLElement).style.width = width + 'px';
          (node as HTMLElement).style.maxWidth = '100%';
          document.documentElement.style.fontSize = fontSize;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        },
        { width, fontSize },
      );
      await expect
        .poll(() =>
          chart.locator('.stage-time-center').evaluate((node) => {
            const svg = node.parentElement!.querySelector('svg')!;
            const circle = svg.querySelector('circle')!;
            const box = svg.getBoundingClientRect();
            const scale = box.width / svg.viewBox.baseVal.width;
            const cx = box.left + Number(circle.getAttribute('cx')) * scale;
            const cy = box.top + Number(circle.getAttribute('cy')) * scale;
            const radius =
              (Number(circle.getAttribute('r')) -
                Number(circle.getAttribute('stroke-width')) / 2) *
              scale;
            return [...node.querySelectorAll('.stage-time-center-title, strong')].every(
              (text) => {
                const rect = text.getBoundingClientRect();
                if (
                  text.classList.contains('stage-time-center-title') &&
                  parseFloat(getComputedStyle(text).fontSize) < 11
                ) {
                  return false;
                }
                return [rect.left, rect.right].every((x) =>
                  [rect.top, rect.bottom].every(
                    (y) => Math.hypot(x - cx, y - cy) <= radius - 1,
                  ),
                );
              },
            );
          }),
        )
        .toBe(true);
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await chart.locator('.stage-time-visual').evaluate((node) => {
    (node as HTMLElement).style.width = '';
  });
  await chart.screenshot({ path: info.outputPath('empty-ring-clearance.png') });
});

/** 经典整页保留双环、简明图例和独立状态区，原地估时与切换后的持久化共用同一 Task。 */
test('retains classic dual rings and separate task groups while sharing inline estimates', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await openWorkspaceSection(page, '计划');
  await page
    .getByRole('button', { name: '查看阶段 多项目时间验收', exact: true })
    .click();
  const detail = page.getByTestId('stage-detail');
  const chart = detail.locator('.stage-time-panel');
  await chart.getByRole('button', { name: '经典', exact: true }).click();
  const legend = chart.getByLabel('项目时间明细', { exact: true });
  const tasks = detail.locator('.stage-classic-task-groups');
  await expect(chart.locator('[data-stage-project-slice]')).toHaveCount(5);
  await expect(chart.locator('[data-stage-slice]')).toHaveCount(20);
  await expect(legend).toBeVisible();
  await expect(legend.getByRole('checkbox')).toHaveCount(0);
  await expect(
    tasks.getByRole('region', { name: '未安排', exact: true }),
  ).toBeVisible();
  await expect(tasks.locator('.stage-task-row')).toHaveCount(22);
  await expect(detail.locator('.stage-time-list-pane')).toBeHidden();
  const chartBox = (await chart.boundingBox())!;
  const tasksBox = (await tasks.boundingBox())!;
  expect(tasksBox.y).toBeGreaterThanOrEqual(chartBox.y + chartBox.height);
  const longTask = legend
    .locator('.stage-time-task')
    .filter({ hasText: '整理这段时间' });
  await longTask.click();
  await page.mouse.move(0, 0);
  await expect(chart.locator('.stage-time-center-title')).toHaveText(
    await longTask.innerText(),
  );
  // 真实选择长任务名后，标题和时长都必须留在圆心内；移动窄屏也保留完整明细。
  await expect
    .poll(() =>
      chart.locator('.stage-time-center').evaluate((node) => {
        const center = node.getBoundingClientRect();
        const title = node.querySelector('.stage-time-center-title')!;
        const label = title.getBoundingClientRect();
        const value = node.querySelector('strong')!.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(title).lineHeight);
        return (
          label.height <= lineHeight * 2 + 1 &&
          label.top >= center.top - 1 &&
          value.bottom <= center.bottom + 1
        );
      }),
    )
    .toBe(true);
  await legend
    .getByRole('button', { name: '编辑 验收任务 2预计分钟', exact: true })
    .click();
  await legend.getByLabel('验收任务 2预计分钟', { exact: true }).fill('65');
  await legend.getByLabel('验收任务 2预计分钟', { exact: true }).press('Enter');
  await expect(
    legend.getByRole('button', { name: '编辑 验收任务 2预计分钟', exact: true }),
  ).toHaveText('1h5min');
  await page.reload();
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await openWorkspaceSection(page, '计划');
  await page
    .getByRole('button', { name: '查看阶段 多项目时间验收', exact: true })
    .click();
  await expect(
    chart.getByRole('button', { name: '经典', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await chart.getByRole('button', { name: '新版', exact: true }).click();
  await expect(tasks).toBeHidden();
  await expect(chart.locator('.stage-time-list-pane')).toBeVisible();
  await expect(
    chart
      .locator('.stage-time-list-pane')
      .getByRole('button', { name: '编辑 验收任务 2预计分钟', exact: true }),
  ).toHaveText('1h5min');
});

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
  await expect(detail.locator('.stage-task-row').filter({ visible: true })).toHaveCount(
    22,
  );
  await expect(chart.locator('[data-stage-slice]')).toHaveCount(20);
  await expect(chart.locator('[data-stage-line]')).toHaveCount(20);
  await expect(chart.locator('[data-stage-label]')).toHaveCount(20);
  // 只显示当前布局的明细；隐藏的经典清单保留编辑草稿，筛选不删图表引线。
  await expect(
    detail.locator('.stage-time-legend').filter({ visible: true }),
  ).toHaveCount(0);
  await expect(detail.locator('.stage-summary')).toHaveCount(1);
  await expect(detail.locator('.stage-detail-heading .stage-summary')).toBeVisible();
  const stateFilter = chart.getByRole('combobox', { name: '筛选阶段任务状态' });
  await stateFilter.selectOption('waiting');
  await expect(chart.locator('.stage-task-row')).toHaveCount(21);
  await stateFilter.selectOption('completed');
  await expect(chart.locator('.stage-task-row')).toHaveCount(1);
  await expect(chart.locator('[data-stage-label]')).toHaveCount(20);
  await stateFilter.selectOption('all');
  if (info.project.name === 'preview-desktop') {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const plot = (await chart.locator('.stage-time-plot').boundingBox())!;
    const list = (await chart.locator('.stage-time-list-pane').boundingBox())!;
    expect(list.x).toBeGreaterThanOrEqual(plot.x + plot.width);
    expect(list.y).toBe(plot.y);
    expect(
      await chart
        .locator('.stage-time-list-pane')
        .evaluate(
          (node) =>
            node.scrollHeight > node.clientHeight &&
            getComputedStyle(node).overflowY === 'auto',
        ),
    ).toBe(true);
  }
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
  await chart.getByLabel('验收任务 2预计分钟', { exact: true }).fill('65');
  await chart.getByLabel('验收任务 2预计分钟', { exact: true }).press('Enter');
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
  await chart.getByLabel('验收任务 2累计实际分钟', { exact: true }).fill('10');
  await chart.getByRole('button', { name: '保存', exact: true }).click();
  // 计划详情不再提供「→ 今天」，安排快捷入口沿用首页同一 Task。
  await expect(detail.getByRole('button', { name: '→ 今天', exact: true })).toHaveCount(
    0,
  );
  await detail.getByRole('button', { name: '显示在首页', exact: true }).click();
  await openWorkspaceSection(page, '首页');
  const homeRow = page.locator(
    '.home-stage-card [data-stage-task-id="demo-stage-time-task-1"]',
  );
  await homeRow.getByRole('button', { name: '→ 今天', exact: true }).click();
  await openWorkspaceSection(page, '计划');
  // 导航回计划会恢复原详情，不重复寻找只在总览中的阶段入口。
  await expect(detail).toBeVisible();
  const row = chart.locator('[data-stage-task-id="demo-stage-time-task-1"]');
  const scheduledDate = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem('threadline.preview-demo.v1:threadline.tasks.v1')!,
      ).find((task: { id: string }) => task.id === 'demo-stage-time-task-1').date,
  );
  await expect(row.locator('time')).toHaveAttribute('datetime', scheduledDate);
  await row.getByRole('checkbox').check();
  await stateFilter.selectOption('completed');
  await expect(chart.locator('.stage-task-row')).toHaveCount(2);
  await expect(row).toBeVisible();
  await stateFilter.selectOption('all');
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

/** 长时长在窄内圈、文字放大及宽度变化后保持完整一行，列表选择与圆环对应。 */
test('fits long center totals to the inner ring after resizing and text zoom', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => {
    const key = 'threadline.preview-demo.v1:threadline.tasks.v1';
    const tasks = JSON.parse(localStorage.getItem(key)!);
    for (const task of tasks.filter(
      (task: { stagePlanId: string }) => task.stagePlanId === 'demo-stage-time',
    ))
      task.plannedDurationMinutes = task.id === 'demo-stage-time-task-0' ? 672 : 0;
    localStorage.setItem(key, JSON.stringify(tasks));
  });
  await page.reload();
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await openWorkspaceSection(page, '计划');
  await page
    .getByRole('button', { name: '查看阶段 多项目时间验收', exact: true })
    .click();
  const chart = page.locator('.stage-time-panel');
  const center = chart.locator('.stage-time-center');
  await expect(center.locator('strong')).toHaveText('11h12min');
  for (const fontSize of ['', '200%']) {
    for (const width of [600, 390, 320, 240]) {
      await chart.locator('.stage-time-visual').evaluate(
        async (node, options) => {
          (node as HTMLElement).style.width = options.width + 'px';
          (node as HTMLElement).style.maxWidth = '100%';
          document.documentElement.style.fontSize = options.fontSize;
          // 先让浏览器呈现新布局及 ResizeObserver 的更新，不能把旧几何当作适配成功。
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
        },
        { width, fontSize },
      );
      await expect
        .poll(() =>
          // 原子读取几何，不在每次轮询前额外采集整页 Locator 快照。
          page.evaluate(() => {
            const node = document.querySelector(
              '.stage-time-panel .stage-time-center',
            )!;
            const box = node.getBoundingClientRect();
            const value = node.querySelector('strong')!;
            const text = value.getBoundingClientRect();
            const plot = node.parentElement!;
            const plotWidth = plot.getBoundingClientRect().width;
            const svgWidth = plot.querySelector('svg')!.viewBox.baseVal.width;
            const fits =
              Math.abs(svgWidth - plotWidth) <= 1 &&
              text.width <= box.width * 0.95 + 1 &&
              text.left >= box.left &&
              text.right <= box.right &&
              text.height <= parseFloat(getComputedStyle(value).lineHeight) + 1;
            return fits
              ? []
              : [
                  {
                    boxWidth: box.width,
                    valueWidth: text.width,
                    plotWidth,
                    svgWidth,
                    textHeight: text.height,
                    lineHeight: getComputedStyle(value).lineHeight,
                    font: getComputedStyle(value).font,
                    sampleFont: getComputedStyle(
                      node.querySelector('.stage-time-center-sample')!,
                    ).font,
                    sampleWidth: node
                      .querySelector('.stage-time-center-sample')!
                      .getBoundingClientRect().width,
                  },
                ];
          }),
        )
        .toEqual([]);
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await chart.locator('.stage-time-visual').evaluate((node) => {
    (node as HTMLElement).style.width = '';
  });
  const task = chart.locator('[data-stage-task-id="demo-stage-time-task-0"]');
  await task.locator('.stage-task-title').click();
  await expect(task.locator('.stage-task-title')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    chart.locator('[data-stage-label="demo-stage-time-task-0"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await openTaskMenu(
    task.getByRole('button', { name: /更多操作/, includeHidden: true }),
  );
  await page.getByRole('menuitem', { name: '编辑', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await chart.screenshot({ path: info.outputPath('long-ring-center.png') });
});

test('runs three independent timers, resumes after reload and records completion once', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto('/');
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await page.clock.install();
  const timers = page.getByRole('region', { name: '任务计时器', exact: true });
  let desktopSize: { width: number; height: number } | undefined;
  for (let i = 0; i < 3; i++) {
    await openWorkspaceSection(page, '计划');
    if (!(await page.getByTestId('stage-detail').isVisible()))
      await page
        .getByRole('button', { name: '查看阶段 多项目时间验收', exact: true })
        .click();
    const row = page
      .locator('[data-stage-task-id="demo-stage-time-task-' + i + '"]')
      .filter({ visible: true });
    if (info.project.name === 'preview-desktop') await row.click({ button: 'right' });
    else
      await openTaskMenu(
        row.getByRole('button', { name: /更多操作/, includeHidden: true }),
      );
    await page.getByRole('menuitem', { name: '加入计时', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '加入计时', exact: true });
    if (i === 2) {
      await dialog.getByLabel('计时方式').selectOption('down');
      await dialog.getByLabel('倒计时分钟').fill('1');
    }
    await dialog.getByRole('button', { name: '开始计时', exact: true }).click();
    await openWorkspaceSection(page, '首页');
    if (info.project.name === 'preview-desktop') {
      const cards = await timers.locator('.task-timer').evaluateAll((items) =>
        items.map((item) => {
          const bounds = item.getBoundingClientRect();
          const clock = item.querySelector('time')!.getBoundingClientRect();
          const controls = item
            .querySelector('.task-timer-actions')!
            .getBoundingClientRect();
          return {
            width: bounds.width,
            height: bounds.height,
            inlineControls: controls.y < clock.bottom && controls.bottom > clock.y,
          };
        }),
      );
      desktopSize ??= cards[0];
      expect(
        cards.every(
          (card) =>
            card.width === desktopSize!.width &&
            card.height === desktopSize!.height &&
            card.inlineControls,
        ),
      ).toBe(true);
      if (i >= 1) {
        await page.setViewportSize({ width: 1254, height: 720 });
        const title = (await page
          .getByRole('heading', { name: '任务大厅', exact: true })
          .boundingBox())!;
        const headerCards = await timers.locator('.task-timer').evaluateAll((items) =>
          items.map((item) => {
            const bounds = item.getBoundingClientRect();
            return {
              y: bounds.y,
              right: bounds.right,
              width: bounds.width,
              height: bounds.height,
            };
          }),
        );
        expect(
          headerCards.every(
            (card) =>
              card.y < title.y + title.height &&
              card.width === desktopSize!.width &&
              card.height === desktopSize!.height,
          ),
        ).toBe(true);
        expect(
          (await page.locator('.tl-header-actions').boundingBox())!.x,
        ).toBeGreaterThanOrEqual(Math.max(...headerCards.map((card) => card.right)));
        await page.screenshot({
          path: info.outputPath(
            i === 1 ? 'home-two-timers.png' : 'home-three-timers.png',
          ),
        });
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    }
    if (i === 0 && info.project.name === 'preview-desktop') {
      const title = (await page
        .getByRole('heading', { name: '任务大厅', exact: true })
        .boundingBox())!;
      const firstTimer = (await timers.locator('.task-timer').boundingBox())!;
      expect(firstTimer.x).toBeGreaterThan(title.x + title.width);
      expect(firstTimer.y).toBeLessThan(title.y + title.height);
    }
  }
  await expect(timers.locator('.task-timer')).toHaveCount(3);
  await expect(timers.locator('.task-timer-symbol, .task-timer-mode')).toHaveCount(0);
  await expect(timers.locator('[data-mode="up"] .task-timer-readout')).toHaveCount(2);
  await expect(
    timers.locator('[data-mode="down"] .task-timer-readout'),
  ).toHaveAttribute('aria-label', /倒计时/);
  await openWorkspaceSection(page, '计划');
  const duplicate = page
    .locator('[data-stage-task-id="demo-stage-time-task-0"]')
    .filter({ visible: true });
  await openTaskMenu(
    duplicate.getByRole('button', { name: /更多操作/, includeHidden: true }),
  );
  await expect(
    page.getByRole('menuitem', { name: '已加入计时', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await openTaskMenu(
    page
      .locator('[data-stage-task-id="demo-stage-time-task-4"]')
      .filter({ visible: true })
      .getByRole('button', { name: /更多操作/, includeHidden: true }),
  );
  await expect(
    page.getByRole('menuitem', { name: '最多三个计时器', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await openWorkspaceSection(page, '首页');
  await page.clock.fastForward(35000);
  await timers
    .locator('.task-timer')
    .first()
    .getByRole('button', { name: '暂停', exact: true })
    .click();
  const pausedClock = await timers
    .locator('.task-timer')
    .first()
    .locator('.task-timer-readout')
    .innerText();
  await page.clock.fastForward(35000);
  await expect(
    timers.locator('.task-timer').first().locator('.task-timer-readout'),
  ).toHaveText(pausedClock);
  await expect(
    timers.locator('.task-timer').nth(1).locator('.task-timer-readout'),
  ).toHaveText(/^00:01:\d\d$/);
  await expect(
    timers.locator('.task-timer').nth(2).locator('.task-timer-readout'),
  ).toHaveAttribute('aria-label', '倒计时已到时');
  await expect(timers).not.toContainText('按分钟四舍五入');
  await expect(timers).not.toContainText('结束时完成任务');
  const timerBounds = await timers.locator('.task-timer').evaluateAll((cards) =>
    cards.map((card) => ({
      y: card.getBoundingClientRect().y,
      overflow: card.scrollWidth > card.clientWidth + 1,
      clocksReadable: [...card.querySelectorAll('time')].every(
        (clock) =>
          clock.getBoundingClientRect().height <=
          parseFloat(getComputedStyle(clock).lineHeight) + 1,
      ),
      controlsAccessible: [...card.querySelectorAll('button')]
        .filter((button) => getComputedStyle(button).display !== 'none')
        .every(
          (button) =>
            button.getBoundingClientRect().width >=
              (matchMedia('(pointer: coarse), (max-width: 760px)').matches ? 44 : 32) &&
            button.getBoundingClientRect().height >=
              (matchMedia('(pointer: coarse), (max-width: 760px)').matches ? 44 : 32),
        ),
      controlsSeparate: [...card.querySelectorAll('button')]
        .filter((button) => getComputedStyle(button).display !== 'none')
        .map((button) => button.getBoundingClientRect())
        .every((rect, index, rects) =>
          rects
            .slice(index + 1)
            .every(
              (other) =>
                rect.right <= other.left ||
                other.right <= rect.left ||
                rect.bottom <= other.top ||
                other.bottom <= rect.top,
            ),
        ),
    })),
  );
  expect(
    timerBounds.every(
      (card) =>
        !card.overflow &&
        card.clocksReadable &&
        card.controlsAccessible &&
        card.controlsSeparate,
    ),
  ).toBe(true);
  if (info.project.name === 'preview-desktop')
    expect(new Set(timerBounds.map((card) => card.y)).size).toBe(1);
  await page.screenshot({ path: info.outputPath('home-timers.png') });
  if (info.project.name === 'preview-desktop') {
    await page.setViewportSize({ width: 2560, height: 1440 });
    const heading = (await page
      .getByRole('heading', { name: '任务大厅', exact: true })
      .boundingBox())!;
    const cards = await timers.locator('.task-timer').evaluateAll((items) =>
      items.map((item) => ({
        x: item.getBoundingClientRect().x,
        y: item.getBoundingClientRect().y,
      })),
    );
    expect(
      cards.every(
        (card) =>
          card.x > heading.x + heading.width && card.y < heading.y + heading.height,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath('home-timers-wide.png') });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  for (const scheme of ['light', 'dark']) {
    await page.evaluate((scheme) => {
      document.documentElement.dataset.colorScheme = scheme;
    }, scheme);
    expect(
      (await new AxeBuilder({ page }).include('.task-timers').analyze()).violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath('home-timers-' + scheme + '.png') });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  expect(
    await timers
      .locator('.task-timer')
      .evaluateAll((cards) =>
        cards.every((card) => card.scrollWidth <= card.clientWidth + 1),
      ),
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
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
  expect(
    (await new AxeBuilder({ page }).include('.task-timers').analyze()).violations,
  ).toEqual([]);
  await page.clock.fastForward(7200000);
  await expect(
    timers.locator('.task-timer').first().locator('.task-timer-readout'),
  ).toHaveText(/^02:\d\d:\d\d$/);
  expect(
    await timers
      .locator('.task-timer-readout')
      .evaluateAll((clocks) =>
        clocks.every(
          (clock) =>
            clock.scrollWidth <= clock.clientWidth + 1 &&
            clock.getBoundingClientRect().height <=
              parseFloat(getComputedStyle(clock).lineHeight) + 1,
        ),
      ),
  ).toBe(true);
});

test('adds timers from schedule and waiting menus and removes only the timer', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('threadline.preview-demo.v1:threadline.tasks.v1')!),
  );
  const row = page.locator('.timeline-row').filter({ hasText: '邮件处理' });
  if (info.project.name === 'preview-desktop') {
    await row.getByRole('checkbox', { name: '完成邮件处理', exact: true }).focus();
    await page.keyboard.press('Shift+F10');
  } else
    await openTaskMenu(
      row.getByRole('button', {
        name: '邮件处理更多操作',
        exact: true,
        includeHidden: true,
      }),
    );
  await page.getByRole('button', { name: '加入计时', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '加入计时', exact: true });
  await dialog.getByLabel('计时方式').selectOption('down');
  await dialog.getByLabel('倒计时分钟').fill('15');
  await page.screenshot({ path: info.outputPath('timer-settings.png') });
  await dialog.getByRole('button', { name: '开始计时', exact: true }).click();
  const card = page.locator('.task-timer');
  await expect(card).toHaveAttribute('data-mode', 'down');
  if (info.project.name === 'preview-desktop') await card.click({ button: 'right' });
  else
    await card
      .getByRole('button', {
        name: '邮件处理计时器更多操作',
        exact: true,
        includeHidden: true,
      })
      .click();
  const menu = page.getByRole('menu', { name: '邮件处理计时器操作', exact: true });
  await expect(menu).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include('.task-timer-menu').analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('timer-menu.png') });
  await menu.getByRole('menuitem', { name: '删除计时器', exact: true }).click();
  await expect(card).toHaveCount(0);
  await openTaskMenu(
    row.getByRole('button', {
      name: '邮件处理更多操作',
      exact: true,
      includeHidden: true,
    }),
  );
  await expect(
    page.getByRole('button', { name: '加入计时', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '加入计时', exact: true }).click();
  await dialog.getByRole('button', { name: '开始计时', exact: true }).click();
  await expect(card).toHaveCount(1);
  if (info.project.name === 'preview-desktop') await card.click({ button: 'right' });
  else
    await card
      .getByRole('button', { name: /计时器更多操作/, includeHidden: true })
      .click();
  await page.getByRole('menuitem', { name: '删除计时器', exact: true }).click();
  await expect(card).toHaveCount(0);
  const waiting = page.locator('.waiting-task-row').first();
  if (info.project.name === 'preview-desktop') await waiting.click({ button: 'right' });
  else
    await openTaskMenu(
      waiting.getByRole('button', { name: /更多操作/, includeHidden: true }),
    );
  await page.getByRole('menuitem', { name: '加入计时', exact: true }).click();
  await dialog.getByRole('button', { name: '开始计时', exact: true }).click();
  await expect(card).toHaveAttribute('data-mode', 'up');
  if (info.project.name === 'preview-desktop') {
    await card.focus();
    await page.keyboard.press('Shift+F10');
  } else
    await card
      .getByRole('button', { name: /计时器更多操作/, includeHidden: true })
      .click();
  await page.getByRole('menuitem', { name: '删除计时器', exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem('threadline.preview-demo.v1:threadline.tasks.v1')!,
      ),
    ),
  ).toEqual(before);
  await page.reload();
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await expect(card).toHaveCount(0);
});

/** 同浏览器的两个首页应共同看到本机计时；删除释放任务和名额，旧标签不得恢复已删计时。 */
test('re-adds the same task after timer removal across open tabs', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  const more = page.getByRole('button', {
    name: '邮件处理更多操作',
    exact: true,
    includeHidden: true,
  });
  await openTaskMenu(more);
  await page.getByRole('button', { name: '加入计时', exact: true }).click();
  await page
    .getByRole('dialog', { name: '加入计时', exact: true })
    .getByRole('button', { name: '开始计时', exact: true })
    .click();
  const other = await page.context().newPage();
  await other.goto('/');
  await expect(other.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await expect(other.locator('.task-timer')).toHaveCount(1);
  if (info.project.name === 'preview-desktop')
    await page.locator('.task-timer').click({ button: 'right' });
  else
    await page
      .locator('.task-timer')
      .getByRole('button', { name: /计时器更多操作/, includeHidden: true })
      .click();
  await page.getByRole('menuitem', { name: '删除计时器', exact: true }).click();
  await expect(page.locator('.task-timer')).toHaveCount(0);
  await openTaskMenu(more);
  await expect(
    page.getByRole('button', { name: '加入计时', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(other.locator('.task-timer')).toHaveCount(0);
  await openTaskMenu(
    other.getByRole('button', {
      name: '邮件处理更多操作',
      exact: true,
      includeHidden: true,
    }),
  );
  await expect(
    other.getByRole('button', { name: '加入计时', exact: true }),
  ).toBeEnabled();
  await other.getByRole('button', { name: '加入计时', exact: true }).click();
  await other
    .getByRole('dialog', { name: '加入计时', exact: true })
    .getByRole('button', { name: '开始计时', exact: true })
    .click();
  await expect(page.locator('.task-timer')).toHaveCount(1);
  await page
    .locator('.task-timer')
    .getByRole('button', { name: '暂停', exact: true })
    .click();
  await expect(
    other.locator('.task-timer').getByRole('button', { name: '继续', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
  await expect(
    page.locator('.task-timer').getByRole('button', { name: '继续', exact: true }),
  ).toBeVisible();
  await other.close();
});

test('keeps the home layout while switching the right column and using wide screen space', async ({
  page,
}, info) => {
  test.setTimeout(90000);
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
    side.getByRole('region', { name: '日程时间分布', exact: true }),
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
  await expect(chart.locator('.stage-time-metrics')).toHaveCount(0);
  await expect(chart.locator('.stage-time-description')).toHaveCount(0);
  await expect(chart.locator('.stage-time-switcher button')).toHaveCount(3);
  await expect(page.locator('[data-day-remaining]')).toHaveText('1h30min');
  await expect(page.locator('[data-day-total]')).toHaveText('3h');
  await page.locator('.dashboard-overview').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('home-header.png') });
  await expect
    .poll(() =>
      page.locator('.day-time-fraction > em').evaluateAll((values) =>
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
  // WebKit 冷启动加载真实业务模块；先等工作台，避免把 5s 控件等待当成偏好丢失。
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
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
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30000 });
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
