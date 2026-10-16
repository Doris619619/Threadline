/** @fileoverview 用隔离本地适配器与真实 threadline 协议验收计时站；可带 --show 保留演示窗口，不生成安装包。 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect } from 'playwright/test';

const userData = await mkdtemp(join(tmpdir(), 'threadline-timer-station-'));
const output = resolve('test-results/timer-station');
await mkdir(output, { recursive: true });
const show = process.argv.includes('--show');
let application;
const errors = [];
// 不可信旧尺寸不能导致窗口不可见或过大；首次配置必须回退紧凑默认值。
await writeFile(
  join(userData, 'timer-station-sizes.json'),
  JSON.stringify({
    horizontal: { width: -1, height: 999999 },
    vertical: null,
  }),
);

/** 为隔离测试用户填充三条真实领域任务和可记账计时；不访问使用者账号或资料目录。 */
async function seed(page) {
  await page.evaluate(() => {
    const now = Date.now();
    const date = new Intl.DateTimeFormat('en-CA').format(new Date(now));
    const titles = ['阅读课程材料', '整理文献笔记', '跟读练习'];
    const projects = ['课程', '研究', '英语'].map((name, index) => ({
      id: `station-project-${index}`,
      name,
      color: '#4b6a15',
      status: 'active',
      createdAt: new Date(now).toISOString(),
    }));
    const tasks = titles.map((title, index) => ({
      id: `station-task-${index}`,
      projectId: projects[index].id,
      title,
      date,
      status: 'active',
      importance: 'normal',
      completed: false,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    }));
    const elapsed = [2535000, 1124000, 709000];
    const timers = tasks.map((task, index) => ({
      id: `station-timer-${index}`,
      taskId: task.id,
      title: task.title,
      mode: index === 2 ? 'down' : 'up',
      targetMs: 20 * 60000,
      elapsedMs: index === 1 ? elapsed[index] : 0,
      ...(index === 1 ? {} : { startedAt: now - elapsed[index] }),
      firstStartedAt: now - elapsed[index],
      entryDate: date,
      intervals: index === 1 ? [{ start: now - elapsed[index], end: now }] : [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));
    localStorage.setItem('threadline.projects.v1', JSON.stringify(projects));
    localStorage.setItem('threadline.tasks.v1', JSON.stringify(tasks));
    localStorage.setItem('threadline.task-timers.v1:local', JSON.stringify(timers));
    localStorage.setItem('threadline.task-time-entries.v1', '[]');
    localStorage.setItem('threadline.task-timer-records.v1', '[]');
    localStorage.setItem(
      'threadline.timer-station.v1',
      JSON.stringify({ layout: 'horizontal', pinned: true }),
    );
  });
  await page.reload();
  await expect(page.locator('.task-timer')).toHaveCount(3);
}

/** 打开真实子窗口并等待父会话的 portal，而非在测试中伪造 station bridge。 */
async function open(page) {
  const opened = application.waitForEvent('window');
  await page.getByRole('button', { name: '计时站', exact: true }).click();
  const station = await opened;
  console.log('Station opened:', station.url());
  station.on('pageerror', (error) => errors.push(error.message));
  station.on('console', (message) => {
    if (message.type() === 'error') console.log('STATION:', message.text());
  });
  await expect(station.locator('.task-timer')).toHaveCount(3);
  return station;
}

/** 同时验证时钟与按钮不重叠、卡片内容不溢出，以及标题确实位于同一行。 */
async function verifyLayout(station) {
  const boxes = await station.locator('.task-timer').evaluateAll((cards) =>
    cards.map((card) => {
      const clock = card.querySelector('.task-timer-readout');
      const digits = clock.querySelector('span').getBoundingClientRect();
      const actions = card.querySelector('.task-timer-actions').getBoundingClientRect();
      const heading = card.querySelector('.task-timer-heading').getBoundingClientRect();
      const project = card.querySelector('.task-timer-project').getBoundingClientRect();
      const title = card.querySelector('strong').getBoundingClientRect();
      return {
        clear: digits.right + 5 <= actions.left,
        fits: card.scrollWidth <= card.clientWidth,
        singleLine: project.top >= heading.top && title.bottom <= heading.bottom,
        text: clock.textContent,
      };
    }),
  );
  assert.ok(
    boxes.every((box) => box.clear && box.fits && box.singleLine),
    JSON.stringify(boxes),
  );
}

/** 使用真实 BrowserWindow 调整尺寸并模拟原生拖动起止事件；检验记忆逻辑，不冒充物理鼠标验收。 */
async function resizeStation(width, height) {
  await application.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('timer-station'),
      );
      assertResizable(window);
      /** 在主进程验证原生边框允许调整，不依赖渲染器的 CSS resize。 */
      function assertResizable(target) {
        if (!target.isResizable()) throw new Error('计时站未启用原生调整大小');
      }
      window.emit(
        'will-resize',
        {},
        { ...window.getBounds(), ...size },
        { edge: 'bottom-right' },
      );
      window.setContentSize(size.width, size.height);
      window.emit('resized');
    },
    { width, height },
  );
  await expectStationSize(width, height);
}

/** 以内容逻辑像素比较尺寸，容忍 Windows DPI 下的一像素舍入。 */
async function expectStationSize(width, height) {
  await expect
    .poll(async () => {
      const size = await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes('timer-station'))
          .getContentSize(),
      );
      return Math.abs(size[0] - width) <= 1 && Math.abs(size[1] - height) <= 1;
    })
    .toBe(true);
}

try {
  application = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, THREADLINE_ELECTRON_RENDERER_URL: 'threadline://app/' },
  });
  const page = await application.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: '计时站', exact: true }).waitFor();
  await seed(page);
  let station = await open(page);
  await expectStationSize(940, 208);
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('role=main'))
        .webContents.getBackgroundThrottling(),
    ),
    false,
  );
  await verifyLayout(station);
  await station.screenshot({ path: join(output, 'horizontal.png'), scale: 'css' });
  await resizeStation(340, 208);
  await verifyLayout(station);
  await resizeStation(940, 300);
  await verifyLayout(station);
  await resizeStation(640, 240);
  await verifyLayout(station);
  await station.screenshot({
    path: join(output, 'horizontal-resized.png'),
    scale: 'css',
  });
  assert.deepEqual(
    await station.evaluate(() => Object.keys(window.threadlineDesktop).sort()),
    ['environment', 'role'],
  );
  assert.equal(
    await page.evaluate(() => window.open('https://example.com', '_blank')),
    null,
  );
  await station.getByRole('button', { name: '取消置顶' }).click();
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('timer-station'))
        .isAlwaysOnTop(),
    ),
    false,
  );
  await station.getByRole('button', { name: '置顶窗口' }).click();
  await expectStationSize(640, 240);
  await station.getByRole('button', { name: '纵向', exact: true }).click();
  await expect(station.locator('.timer-station')).toHaveAttribute(
    'data-layout',
    'vertical',
  );
  await verifyLayout(station);
  await station.screenshot({ path: join(output, 'vertical.png'), scale: 'css' });
  await resizeStation(380, 390);
  await verifyLayout(station);
  await station.getByRole('button', { name: '横向', exact: true }).click();
  await expectStationSize(640, 240);
  await station.getByRole('button', { name: '纵向', exact: true }).click();
  await expectStationSize(380, 390);
  const first = station.locator('.task-timer').first();
  const startLabel = await first.locator('.task-timer-date').textContent();
  await first.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(
    page
      .locator('.task-timer')
      .first()
      .getByRole('button', { name: '继续', exact: true }),
  ).toBeVisible();
  await page
    .locator('.task-timer')
    .first()
    .getByRole('button', { name: '继续', exact: true })
    .click();
  await expect(first.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  assert.equal(await first.locator('.task-timer-date').textContent(), startLabel);
  await station.getByRole('button', { name: '关闭计时站' }).click();
  await expect(page.locator('.task-timer')).toHaveCount(3);
  station = await open(page);
  await expectStationSize(380, 390);
  await expect(station.locator('.timer-station')).toHaveAttribute(
    'data-layout',
    'vertical',
  );
  // 从主窗口制造到时，验证续时浮层属于子窗口并且不记账。
  await page.evaluate(() => {
    const key = 'threadline.task-timers.v1:local';
    const timers = JSON.parse(localStorage.getItem(key));
    timers[2].elapsedMs = timers[2].targetMs;
    timers[2].startedAt = undefined;
    const end = Date.now();
    timers[2].firstStartedAt = end - timers[2].targetMs;
    timers[2].intervals = [{ start: end - timers[2].targetMs, end }];
    localStorage.setItem(key, JSON.stringify(timers));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  });
  await station.getByRole('button', { name: '延长', exact: true }).click();
  await expect(station.getByRole('group', { name: '延长倒计时' })).toBeVisible();
  assert.equal(await page.getByRole('group', { name: '延长倒计时' }).count(), 0);
  await station.getByRole('button', { name: '5分钟', exact: true }).click();
  await expect(
    station
      .locator('.task-timer')
      .last()
      .getByRole('button', { name: '暂停', exact: true }),
  ).toBeVisible();
  await station
    .locator('.task-timer')
    .first()
    .getByRole('button', { name: '完成并记耗时' })
    .click();
  await expect(station.locator('.task-timer')).toHaveCount(2);
  await expectStationSize(380, 390);
  await expect(page.locator('.task-timer')).toHaveCount(2);
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('threadline.task-timer-records.v1')),
  );
  assert.equal(records.length, 1);
  await assert.rejects(
    page.evaluate(() =>
      window.threadlineDesktop.timerStationControl({
        action: 'configure',
        layout: 'horizontal',
        count: 99,
        pinned: true,
      }),
    ),
    /无效计时站配置/,
  );
  // 工作站和计时站必须同时可见；切换不重建计时会话。
  await page.getByRole('button', { name: '工作站', exact: true }).click();
  await expect(page.locator('.compact-window-header')).toBeVisible();
  await expect(station.locator('.task-timer')).toHaveCount(2);
  await page.getByRole('button', { name: '打开计时站', exact: true }).click();
  assert.equal(
    application.windows().filter((item) => item.url().includes('timer-station')).length,
    1,
  );
  await station.getByRole('button', { name: '最小化计时站' }).click();
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes('timer-station'))
          .isMinimized(),
      ),
    )
    .toBe(true);
  // 后台配置更新不能唤醒已最小化的计时站。
  await page.evaluate(() =>
    window.threadlineDesktop.timerStationControl({
      action: 'configure',
      layout: 'vertical',
      count: 2,
      pinned: false,
    }),
  );
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('timer-station'))
        .isMinimized(),
    ),
    true,
  );
  await page.getByRole('button', { name: '打开计时站', exact: true }).click();
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes('timer-station'))
          .isMinimized(),
      ),
    )
    .toBe(false);
  for (let remaining = 2; remaining > 0; remaining--) {
    await station.getByRole('button', { name: '完成并记耗时' }).first().click();
    await expect(station.locator('.task-timer')).toHaveCount(remaining - 1);
  }
  await expect(station.getByText('从任务菜单开始计时')).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('threadline.task-timer-records.v1')).length,
    ),
    3,
  );
  await page.reload();
  await expect.poll(() => station.isClosed()).toBe(true);
  assert.deepEqual(errors, []);
  // 用相同隔离目录重启整个 Electron，检验尺寸确实落盘，而非仅留在模块内存。
  await page.getByRole('button', { name: '打开完整工作台', exact: true }).click();
  await application.close();
  application = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, THREADLINE_ELECTRON_RENDERER_URL: 'threadline://app/' },
  });
  const restartedPage = await application.firstWindow();
  await restartedPage.getByRole('button', { name: '计时站', exact: true }).waitFor();
  await seed(restartedPage);
  const restartedStation = await open(restartedPage);
  await expectStationSize(640, 240);
  await restartedStation.getByRole('button', { name: '纵向', exact: true }).click();
  await expectStationSize(380, 390);
  await verifyLayout(restartedStation);
  console.log(
    'PASS: native resize enabled, narrow layout, per-layout size memory across pin/count changes and app restart; native portal, both layouts, no overlap, pause/resume sync, start time, pin, minimize/restore, close/reopen, extension, exactly one recording per timer, empty state, workstation coexistence, reload cleanup, denied external popup/invalid configuration',
  );
  console.log(`Screenshots: ${output}`);
  if (show) {
    await restartedStation.getByRole('button', { name: '横向', exact: true }).click();
    await resizeStation(940, 208);
    await restartedPage.evaluate(() => window.threadlineDesktop.minimizeMainWindow());
    await restartedPage.evaluate(() =>
      window.threadlineDesktop.timerStationControl({ action: 'focus' }),
    );
    console.log('DEMO_READY: isolated local adapter; close windows to exit.');
    await new Promise((resolveExit) => application.once('close', resolveExit));
  }
} catch (error) {
  console.error('Renderer errors:', errors);
  if (application) {
    console.error(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((window) => ({
          url: window.webContents.getURL(),
          visible: window.isVisible(),
        })),
      ),
    );
    for (const [index, page] of application.windows().entries()) {
      if (!page.isClosed()) {
        console.error(
          'Page:',
          index,
          await page
            .locator('body')
            .innerText({ timeout: 2000 })
            .catch(() => 'unavailable'),
        );
        await page
          .screenshot({ path: join(output, `failure-${index}.png`), timeout: 3000 })
          .catch(() => {});
      }
    }
  }
  throw error;
} finally {
  await application?.close();
}
