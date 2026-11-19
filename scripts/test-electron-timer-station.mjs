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
async function open(page, count = 3) {
  const opened = application.waitForEvent('window');
  await page.getByRole('button', { name: /^(计时站|打开计时站)$/ }).click();
  const station = await opened;
  console.log('Station opened:', station.url());
  station.on('pageerror', (error) => errors.push(error.message));
  station.on('console', (message) => {
    if (message.type() === 'error') console.log('STATION:', message.text());
  });
  await expect(station.locator('.task-timer')).toHaveCount(count);
  await station.evaluate(() => {
    window.higStationClicks = [];
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('button');
      if (button)
        window.higStationClicks = [
          ...window.higStationClicks,
          {
            label: button.getAttribute('aria-label') ?? button.textContent,
            x: event.clientX,
            y: event.clientY,
            intended: window.higExpectedControl?.getAttribute('aria-label'),
            intendedBounds: window.higExpectedControl?.getBoundingClientRect().toJSON(),
            sinceIntent:
              performance.now() - (window.higExpectedAt ?? performance.now()),
          },
        ].slice(-20);
    });
  });
  await application.evaluate(({ BrowserWindow }) => {
    globalThis.higStationEvents ??= [];
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes('timer-station'),
    );
    if (!window || window.higEventsAttached) return;
    window.higEventsAttached = true;
    for (const name of ['show', 'hide', 'minimize', 'restore', 'resize', 'resized']) {
      window.on(name, () => {
        globalThis.higStationEvents.push({
          event: name,
          size: window.getContentSize(),
          visible: window.isVisible(),
          minimized: window.isMinimized(),
          zoom: window.webContents.getZoomFactor(),
        });
        globalThis.higStationEvents = globalThis.higStationEvents.slice(-60);
      });
    }
  });
  return station;
}

/** 正常尺寸检查全部卡片；极小窗逐控件滚动并实测命中区，不把不可点击的缩小卡片当通过。 */
async function verifyLayout(station) {
  await expect
    .poll(() =>
      station.locator('.timer-station-header').evaluate((header) => {
        const bounds = header.getBoundingClientRect();
        const controls = [...header.querySelectorAll('h1, button')]
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => node.getBoundingClientRect());
        return controls.every(
          (box, i) =>
            box.left >= bounds.left &&
            box.right <= bounds.right + 1 &&
            box.top >= bounds.top &&
            box.bottom <= bounds.bottom + 1 &&
            controls
              .slice(i + 1)
              .every(
                (other) =>
                  box.right <= other.left + 1 ||
                  other.right <= box.left + 1 ||
                  box.bottom <= other.top + 1 ||
                  other.bottom <= box.top + 1,
              ),
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      station.locator('.task-timer').evaluateAll((cards) => {
        if (cards[0]?.closest('.timer-station-viewport')?.dataset.fit === 'scroll')
          return [];
        return cards
          .map((card) => {
            const viewport = card
              .closest('.timer-station-viewport')
              .getBoundingClientRect();
            const bounds = card.getBoundingClientRect();
            const clock = card.querySelector('.task-timer-readout');
            const readout = clock.getBoundingClientRect();
            const digits = clock.querySelector('span').getBoundingClientRect();
            const actions = card
              .querySelector('.task-timer-actions')
              .getBoundingClientRect();
            const heading = card
              .querySelector('.task-timer-heading')
              .getBoundingClientRect();
            const project = card
              .querySelector('.task-timer-project')
              .getBoundingClientRect();
            const title = card.querySelector('strong').getBoundingClientRect();
            const date = card.querySelector('.task-timer-date').getBoundingClientRect();
            return {
              clear: digits.right + 1 <= actions.left,
              sameRow:
                Math.abs(
                  (readout.top + readout.bottom) / 2 -
                    (actions.top + actions.bottom) / 2,
                ) < 1,
              fits: card.scrollWidth <= card.clientWidth,
              visible:
                bounds.left >= viewport.left &&
                bounds.right <= viewport.right + 1 &&
                bounds.top >= viewport.top &&
                bounds.bottom <= viewport.bottom + 1,
              dateFits: date.bottom <= bounds.bottom && date.right <= bounds.right,
              singleLine: project.top >= heading.top && title.bottom <= heading.bottom,
              text: clock.textContent,
              actionsAccessible: [
                ...card.querySelectorAll('.task-timer-actions button'),
              ]
                .filter((button) => button.getClientRects().length > 0)
                .every(
                  (button) =>
                    button.getBoundingClientRect().width >= 23.999 &&
                    button.getBoundingClientRect().height >= 23.999,
                ),
            };
          })
          .filter(
            (box) =>
              !box.clear ||
              !box.sameRow ||
              !box.fits ||
              !box.visible ||
              !box.dateFits ||
              !box.singleLine ||
              !box.actionsAccessible,
          );
      }),
    )
    .toEqual([]);
  if (
    (await station.locator('.timer-station-viewport').getAttribute('data-fit')) ===
    'scroll'
  ) {
    await verifyReachableControls(station);
    return;
  }
  // 卡片底部只留约 10 DIP 外边距，不允许回归为固定最小高度下的大块空白。
  await expect
    .poll(() =>
      station.locator('.timer-station-viewport').evaluate((viewport) => {
        const cards = [...viewport.querySelectorAll('.task-timer')];
        const bottom = Math.max(
          ...cards.map((card) => card.getBoundingClientRect().bottom),
        );
        return Math.abs(viewport.getBoundingClientRect().bottom - bottom - 10) <= 2;
      }),
    )
    .toBe(true);
}

/** 小窗每个动作仍至少24px，滚动后中心确实属于该按钮；暂停/继续实际点击且不增加账本。 */
async function verifyReachableControls(station) {
  const viewport = station.locator('.timer-station-viewport');
  for (const card of await station.locator('.task-timer').all()) {
    for (const button of await card.getByRole('button').all()) {
      if (!(await button.isVisible())) continue;
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      assert.ok(
        box.width >= 23.999 && box.height >= 23.999,
        '小窗真实动作目标不得小于24 CSS px',
      );
      assert.ok(
        await button.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const target = node.ownerDocument.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          );
          return target === node || node.contains(target);
        }),
        '滚动后的动作中心不能被标题栏或邻近控件覆盖',
      );
    }
    const primary = card.getByRole('button', { name: /^(暂停|继续)$/ });
    if (await primary.count()) {
      const before = await primary.getAttribute('aria-label');
      await primary.evaluate((node) => {
        window.higExpectedControl = node;
        window.higExpectedAt = performance.now();
      });
      await primary.click();
      await expect(
        card.getByRole('button', {
          name: before === '暂停' ? '继续' : '暂停',
          exact: true,
        }),
      ).toBeEnabled();
      const restore = card.getByRole('button', {
        name: before === '暂停' ? '继续' : '暂停',
        exact: true,
      });
      await restore.evaluate((node) => {
        window.higExpectedControl = node;
        window.higExpectedAt = performance.now();
      });
      await restore.click();
      await expect(
        card.getByRole('button', { name: before, exact: true }),
      ).toBeEnabled();
    }
  }
  await viewport.evaluate((node) => node.scrollTo(0, 0));
}

/** 用真实webContents缩放验证常见窗口，测缩放后的CSS命中区；不改变用户首选原生尺寸。 */
async function verifyStationZoom(station) {
  const measurements = [];
  for (const factor of [1, 1.25, 1.5, 2.5]) {
    const nativeSize = await application.evaluate(({ BrowserWindow, screen }, zoom) => {
      const target = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes('timer-station'),
      );
      const area = screen.getDisplayMatching(target.getBounds()).workArea;
      const size = [Math.min(1000, area.width), Math.min(600, area.height)];
      target.setPosition(area.x, area.y);
      target.setContentSize(...size);
      target.webContents.setZoomFactor(zoom);
      return size;
    }, factor);
    await station.bringToFront();
    let geometry;
    await expect
      .poll(async () => {
        geometry = await application.evaluate(({ BrowserWindow, screen }) => {
          const target = BrowserWindow.getAllWindows().find((window) =>
            window.webContents.getURL().includes('timer-station'),
          );
          return {
            bounds: target.getBounds(),
            actualSize: target.getContentSize(),
            workArea: screen.getDisplayMatching(target.getBounds()).workArea,
            visible: target.isVisible(),
            minimized: target.isMinimized(),
            zoom: target.webContents.getZoomFactor(),
          };
        });
        const { bounds, workArea } = geometry;
        return (
          geometry.visible &&
          !geometry.minimized &&
          bounds.x >= workArea.x &&
          bounds.y >= workArea.y &&
          bounds.x + bounds.width <= workArea.x + workArea.width + 1 &&
          bounds.y + bounds.height <= workArea.y + workArea.height + 1 &&
          geometry.actualSize.every(
            (size, index) => Math.abs(size - nativeSize[index]) <= 1,
          )
        );
      })
      .toBe(true);
    await expect
      .poll(() =>
        station.evaluate(
          ({ zoom, width }) => Math.abs(innerWidth - width / zoom) <= 1,
          { zoom: factor, width: nativeSize[0] },
        ),
      )
      .toBe(true);
    await expectStationSize(nativeSize[0], nativeSize[1]);
    await verifyReachableControls(station);
    const remainedVisible = await application.evaluate(({ BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes('timer-station'),
      );
      return target.isVisible() && !target.isMinimized();
    });
    assert.equal(
      remainedVisible,
      true,
      '缩放和逐控件点击期间计时站必须保持原生可见，不能把DOM可命中等同物理可见',
    );
    measurements.push({
      factor,
      requestedSize: [1000, 600],
      nativeSize,
      geometry,
      buttons: await station
        .locator('.task-timer-actions button')
        .evaluateAll((buttons) =>
          buttons
            .filter((button) => button.getClientRects().length > 0)
            .map((button) => ({
              label: button.getAttribute('aria-label'),
              width: button.getBoundingClientRect().width,
              height: button.getBoundingClientRect().height,
            })),
        ),
    });
  }
  await writeFile(
    join(output, 'hig-station-zoom-targets.json'),
    JSON.stringify(measurements, null, 2),
  );
  await application.evaluate(({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('timer-station'),
    );
    target.webContents.setZoomFactor(1);
    target.setContentSize(940, 208);
  });
  await expectStationSize(940, 208);
}

/** 使用真实 BrowserWindow 调整尺寸并模拟原生拖动起止事件；检验记忆逻辑，不冒充物理鼠标验收。 */
async function resizeStation(width, height, fittedHeight = height) {
  await application.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('timer-station'),
      );
      assertResizable(window);
      /** 在主进程验证原生边框允许调整，不依赖渲染器的 CSS resize。 */
      function assertResizable(target) {
        if (!target.isResizable()) throw new Error('计时站未启用原生调整大小');
        // setContentSize 可绕过系统最小值，必须另外检查真实拖动受到的限制。
        if (target.getMinimumSize()[0] > 200) throw new Error('原生最小宽度仍限制缩窄');
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
  await expectStationSize(width, fittedHeight);
}

/** 同时等待原生内容尺寸与两个渲染视口轴；原生 ACK 不代表 Chromium 已处理 resize/zoom。 */
async function expectStationSize(width, height) {
  let observed;
  try {
    await expect
      .poll(async () => {
        const native = await application.evaluate(({ BrowserWindow }) => {
          const target = BrowserWindow.getAllWindows().find((window) =>
            window.webContents.getURL().includes('timer-station'),
          );
          return target
            ? {
                size: target.getContentSize(),
                zoom: target.webContents.getZoomFactor(),
              }
            : null;
        });
        observed = { requested: [width, height], native, renderer: null };
        const station = application
          .windows()
          .find((page) => !page.isClosed() && page.url().includes('timer-station'));
        if (!native || !station) return false;
        try {
          observed.renderer = await station.evaluate(() => {
            const viewport = document.querySelector('.timer-station-viewport');
            const cards = document.querySelector('.timer-station-cards');
            return {
              width: innerWidth,
              height: innerHeight,
              deviceScaleFactor: devicePixelRatio,
              fit: viewport?.getAttribute('data-fit') ?? null,
              viewport: viewport?.getBoundingClientRect().toJSON() ?? null,
              cards: cards?.getBoundingClientRect().toJSON() ?? null,
              bottomGap: cards
                ? innerHeight - cards.getBoundingClientRect().bottom
                : null,
            };
          });
        } catch (error) {
          // 首开导航尚未提供 execution context 时继续按就绪状态轮询，不改断言时限。
          observed.rendererError = error.message;
          return false;
        }
        return (
          Math.abs(native.size[0] - width) <= 1 &&
          Math.abs(native.size[1] - height) <= 1 &&
          Math.abs(observed.renderer.width - native.size[0] / native.zoom) <= 1 &&
          Math.abs(observed.renderer.height - native.size[1] / native.zoom) <= 1
        );
      })
      .toBe(true);
  } catch (error) {
    console.error('Station resize synchronization failed:', JSON.stringify(observed));
    throw error;
  }
}

/** 固定上一渲染视口，验证原生尺寸 ACK 不会提前完成等待；释放后原布局与命中合同仍须通过。 */
async function verifyResizeSynchronization(station) {
  const metrics = await station.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    deviceScaleFactor: devicePixelRatio,
    mobile: false,
  }));
  const session = await station.context().newCDPSession(station);
  let settled = false;
  let resizing;
  try {
    await session.send('Emulation.setDeviceMetricsOverride', metrics);
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes('timer-station'))
        .setContentSize(200, 112),
    );
    resizing = expectStationSize(200, 112).then(() => {
      settled = true;
    });
    // 两个独立进程的真实读取作为消息往返屏障，不用固定 sleep 猜测尺寸通知延迟。
    const native = await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes('timer-station'))
        .getContentSize(),
    );
    const held = await station.evaluate(() => [innerWidth, innerHeight]);
    assert.ok(Math.abs(native[0] - 200) <= 1 && Math.abs(native[1] - 112) <= 1);
    assert.deepEqual(held, [metrics.width, metrics.height]);
    assert.equal(
      settled,
      false,
      '原生 ACK 后仍须等待两个渲染视口轴到达，不能以旧布局继续断言',
    );
    await session.send('Emulation.clearDeviceMetricsOverride');
    await resizing;
    await expect(station.locator('.timer-station-viewport')).toHaveAttribute(
      'data-fit',
      'scroll',
    );
    await verifyLayout(station);
    await writeFile(
      join(output, 'resize-synchronization.json'),
      JSON.stringify(
        {
          native,
          held,
          settledBeforeRelease: false,
          released: await station.evaluate(() => [innerWidth, innerHeight]),
        },
        null,
        2,
      ),
    );
  } finally {
    await session.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    try {
      await resizing;
    } finally {
      await session.detach();
    }
  }
  await resizeStation(940, 208);
}

/** 检查真实原生可见性，而不是隐藏窗口中仍然存在的 DOM。 */
async function expectSurfaces(mainVisible, stationVisible, edgeVisible = false) {
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) => {
        const windows = BrowserWindow.getAllWindows();
        const main = windows.find((w) => w.webContents.getURL().includes('role=main'));
        const station = windows.find((w) =>
          w.webContents.getURL().includes('timer-station'),
        );
        const edge = windows.find((w) =>
          w.webContents.getURL().includes('role=edge-tab'),
        );
        return [
          !!main?.isVisible() && !main.isMinimized(),
          !!station?.isVisible() && !station.isMinimized(),
          !!edge?.isVisible(),
        ];
      }),
    )
    .toEqual([mainVisible, stationVisible, edgeVisible]);
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
  await expect(
    station.getByRole('button', { name: '打开完整工作台', exact: true }),
  ).toHaveText('打开完整工作台');
  await expect(
    station.getByRole('button', { name: '打开工作站', exact: true }),
  ).toHaveCount(0);
  await expectSurfaces(false, true);
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
  await verifyResizeSynchronization(station);
  await station.screenshot({ path: join(output, 'horizontal.png'), scale: 'css' });
  await verifyStationZoom(station);
  // 真实最小原生窗口不再把按钮压到数个像素；每张卡片均可滚动到达并实际暂停/恢复。
  await resizeStation(200, 112);
  await expect(station.locator('.timer-station-viewport')).toHaveAttribute(
    'data-fit',
    'scroll',
  );
  await verifyLayout(station);
  await station.locator('.timer-station-viewport').focus();
  const reached = new Set();
  for (let index = 0; index < 12; index++) {
    await station.keyboard.press('Tab');
    const label = await station.evaluate(() =>
      document.activeElement?.closest('.task-timer')?.getAttribute('aria-label'),
    );
    if (label) reached.add(label);
  }
  assert.equal(reached.size, 3, '最小窗必须能用Tab抵达全部三张卡片的操作');
  const compactMenu = station.getByRole('button', {
    name: '计时站更多操作',
    exact: true,
  });
  await compactMenu.click();
  const stationMenu = station.getByRole('menu', { name: '计时站操作', exact: true });
  await expect(stationMenu).toBeVisible();
  await expect(
    stationMenu.getByRole('menuitemradio', { name: '横向排列', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await station.keyboard.press('Home');
  await expect(
    stationMenu.getByRole('menuitem', { name: '打开完整工作台', exact: true }),
  ).toBeFocused();
  await station.keyboard.press('Escape');
  await expect(compactMenu).toBeFocused();
  await station
    .locator('.timer-station-viewport')
    .evaluate((node) => node.scrollTo(0, 0));
  await expect(
    station
      .locator('.task-timer')
      .first()
      .getByRole('button', { name: '暂停', exact: true }),
  ).toBeInViewport();
  await writeFile(
    join(output, 'hig-station-minimum-targets.json'),
    JSON.stringify(
      await station.locator('.task-timer-actions button').evaluateAll((buttons) =>
        buttons
          .filter((button) => button.getClientRects().length > 0)
          .map((button) => ({
            label: button.getAttribute('aria-label'),
            width: button.getBoundingClientRect().width,
            height: button.getBoundingClientRect().height,
          })),
      ),
      null,
      2,
    ),
  );
  await station.screenshot({
    path: join(output, 'minimum-reachable-controls.png'),
    scale: 'css',
  });
  await resizeStation(340, 208, 115);
  await verifyLayout(station);
  await station.screenshot({
    path: join(output, 'horizontal-smallest.png'),
    scale: 'css',
  });
  await resizeStation(200, 208, 129);
  await verifyLayout(station);
  await resizeStation(320, 208, 147);
  await verifyLayout(station);
  await resizeStation(940, 300, 208);
  await verifyLayout(station);
  await resizeStation(640, 240, 162);
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
  await expectStationSize(640, 162);
  await station.getByRole('button', { name: '纵向', exact: true }).click();
  await expect(station.locator('.timer-station')).toHaveAttribute(
    'data-layout',
    'vertical',
  );
  await verifyLayout(station);
  await station.screenshot({ path: join(output, 'vertical.png'), scale: 'css' });
  // 窄窗口按两行重排标题栏；跨断点缩放后卡片、入口和控件均不能相互覆盖。
  await resizeStation(240, 500, 411);
  await verifyLayout(station);
  await station.screenshot({ path: join(output, 'vertical-narrow.png'), scale: 'css' });
  await resizeStation(200, 500, 355);
  await verifyLayout(station);
  await station.screenshot({
    path: join(output, 'vertical-minimum.png'),
    scale: 'css',
  });
  await station.getByRole('button', { name: '关闭计时站' }).click();
  station = await open(page);
  await expectStationSize(200, 355);
  await verifyLayout(station);
  await station.getByRole('button', { name: '取消置顶' }).click();
  await station.getByRole('button', { name: '置顶窗口' }).click();
  await station
    .locator('.task-timer')
    .first()
    .getByRole('button', { name: '暂停', exact: true })
    .click();
  await station
    .locator('.task-timer')
    .first()
    .getByRole('button', { name: '继续', exact: true })
    .click();
  await station.getByRole('button', { name: '打开完整工作台', exact: true }).click();
  await expectSurfaces(true, false);
  await page.getByRole('button', { name: '计时站', exact: true }).click();
  await expectSurfaces(false, true);
  await expectStationSize(200, 355);
  await resizeStation(339, 500);
  await verifyLayout(station);
  await resizeStation(340, 500);
  await verifyLayout(station);
  await resizeStation(380, 390);
  await verifyLayout(station);
  await resizeStation(340, 208);
  await verifyLayout(station);
  await resizeStation(380, 390);
  await station.getByRole('button', { name: '横向', exact: true }).click();
  await expectStationSize(640, 162);
  await station.getByRole('button', { name: '纵向', exact: true }).click();
  await expectStationSize(380, 390);
  const first = station.locator('.task-timer').first();
  const startLabel = await first.locator('.task-timer-date').textContent();
  await first.getByRole('button', { name: '暂停', exact: true }).click();
  await station.getByRole('button', { name: '打开完整工作台', exact: true }).click();
  await expectSurfaces(true, false);
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
  await page.getByRole('button', { name: '计时站', exact: true }).click();
  await expectSurfaces(false, true);
  await expect(first.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  assert.equal(await first.locator('.task-timer-date').textContent(), startLabel);
  await station.getByRole('button', { name: '关闭计时站' }).click();
  await expectSurfaces(true, false);
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
  await resizeStation(200, 390, 355);
  await station.getByRole('button', { name: '延长', exact: true }).click();
  const extension = station.getByRole('group', { name: '延长倒计时' });
  await expect(extension).toBeVisible();
  assert.ok(
    await extension.evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      return (
        panel.scrollWidth <= panel.clientWidth &&
        [...panel.querySelectorAll('button')].every((button) => {
          const box = button.getBoundingClientRect();
          return box.left >= bounds.left && box.right <= bounds.right;
        })
      );
    }),
    '最窄计时站的全部续时选项必须完整可点击',
  );
  assert.equal(await page.getByRole('group', { name: '延长倒计时' }).count(), 0);
  await station.getByRole('button', { name: '5分钟', exact: true }).click();
  await expect(
    station
      .locator('.task-timer')
      .last()
      .getByRole('button', { name: '暂停', exact: true }),
  ).toBeVisible();
  await resizeStation(380, 390);
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
  // 重现用户的双计时横排窄窗：所有卡片可见、按钮不换行，并实际点击缩放后的控件。
  await station.getByRole('button', { name: '横向', exact: true }).click();
  await resizeStation(500, 208, 178);
  await verifyLayout(station);
  await station.screenshot({
    path: join(output, 'two-timers-small.png'),
    scale: 'css',
  });
  // 低于旧最小高度的紧凑尺寸也必须保存并在重开后恢复。
  await station.getByRole('button', { name: '关闭计时站' }).click();
  station = await open(page, 2);
  await expectStationSize(500, 178);
  await station
    .locator('.task-timer')
    .first()
    .getByRole('button', { name: '继续', exact: true })
    .click();
  await station
    .locator('.task-timer')
    .first()
    .getByRole('button', { name: '暂停', exact: true })
    .click();
  await resizeStation(640, 240, 211);
  await station.getByRole('button', { name: '纵向', exact: true }).click();
  await expectStationSize(380, 390);
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
  // 计时站只有返回完整工作台的入口；工作站从完整工作台进入，三者仍互斥。
  await station.getByRole('button', { name: '打开完整工作台', exact: true }).click();
  await expectSurfaces(true, false);
  await page.getByRole('button', { name: '工作站', exact: true }).click();
  await expectSurfaces(true, false);
  await expect(page.locator('.compact-window-header')).toBeVisible();
  await expect(station.locator('.task-timer')).toHaveCount(2);
  await page.getByRole('button', { name: '打开计时站', exact: true }).click();
  await expectSurfaces(false, true);
  // 关闭计时站应回到之前的工作站，而不是出现两个窗口或丢失入口。
  await station.getByRole('button', { name: '关闭计时站' }).click();
  await expectSurfaces(true, false);
  await expect(page.locator('.compact-window-header')).toBeVisible();
  station = await open(page, 2);
  await expectSurfaces(false, true);
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
  await page.evaluate(() =>
    window.threadlineDesktop.timerStationControl({ action: 'focus' }),
  );
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes('timer-station'))
          .isMinimized(),
      ),
    )
    .toBe(false);
  // 计时站能从工作站、贴边收起、full 最小化三个状态恢复原主窗口，且不改动计时缓存。
  const timersBeforeOpen = await page.evaluate(() =>
    localStorage.getItem('threadline.task-timers.v1:local'),
  );
  for (const state of ['workstation', 'edge-collapsed', 'minimized-full']) {
    if (state === 'edge-collapsed') {
      await page.getByRole('button', { name: '工作站', exact: true }).click();
      await page.getByRole('button', { name: '收起', exact: false }).click();
      await expectSurfaces(false, false, true);
      await page.evaluate(() =>
        window.threadlineDesktop.timerStationControl({ action: 'focus' }),
      );
      await expectSurfaces(false, true);
    } else if (state === 'minimized-full') {
      await page.evaluate(() => window.threadlineDesktop.minimizeMainWindow());
      await page.evaluate(() =>
        window.threadlineDesktop.timerStationControl({ action: 'focus' }),
      );
    }
    await station.getByRole('button', { name: '打开完整工作台', exact: true }).click();
    await expect(page.locator('.full-window-chrome')).toBeVisible();
    await expectSurfaces(true, false);
    await expect
      .poll(() =>
        application.evaluate(({ BrowserWindow }) => {
          const main = BrowserWindow.getAllWindows().find((w) =>
            w.webContents.getURL().includes('role=main'),
          );
          return main.isVisible() && !main.isMinimized() && main.isFocused();
        }),
      )
      .toBe(true);
    await expect(station.locator('.task-timer')).toHaveCount(2);
    await expectStationSize(380, 390);
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem('threadline.task-timers.v1:local'),
      ),
      timersBeforeOpen,
    );
  }
  // 原生 show（如系统激活）也不能绕过互斥；重复展开沿用同一个子窗口。
  await page.getByRole('button', { name: '计时站', exact: true }).click();
  await expectSurfaces(false, true);
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('role=main'))
      .show(),
  );
  await expectSurfaces(true, false);
  await page.getByRole('button', { name: '工作站', exact: true }).click();
  await page.getByRole('button', { name: '打开计时站', exact: true }).click();
  await expectSurfaces(false, true);
  // 原生工作站恢复、显示器变化都不能留下第二个可见视图。
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('role=main'))
      .show(),
  );
  await expectSurfaces(true, false);
  await page.getByRole('button', { name: '打开计时站', exact: true }).click();
  await application.evaluate(({ screen }) =>
    screen.emit('display-metrics-changed', {}, screen.getPrimaryDisplay(), [
      'workArea',
    ]),
  );
  await expectSurfaces(false, true);
  for (let remaining = 2; remaining > 0; remaining--) {
    await station.getByRole('button', { name: '完成并记耗时' }).first().click();
    await expect(station.locator('.task-timer')).toHaveCount(remaining - 1);
    if (remaining === 2) {
      await expectStationSize(380, 226);
      await verifyLayout(station);
    }
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
  let restartedStation = await open(restartedPage);
  await expectStationSize(640, 162);
  await restartedStation.getByRole('button', { name: '纵向', exact: true }).click();
  await expectStationSize(380, 390);
  await verifyLayout(restartedStation);
  // 隐藏主窗口重载仍须恢复可见入口，不能留下无界面的后台应用。
  await restartedPage.reload();
  await expect.poll(() => restartedStation.isClosed()).toBe(true);
  await expectSurfaces(true, false);
  restartedStation = await open(restartedPage);
  await expectSurfaces(false, true);
  await expectStationSize(380, 390);
  console.log(
    'PASS: 100/125/150/250% native zoom stays inside physical work area and visible; 200x112 three timers retain reachable controls and keyboard/menu focus; text-only full workspace entry, no direct workstation entry, narrow header fits; full/workstation/timer station mutually exclusive, edge hidden on station activation, native show and display recovery, close restores previous workspace, hidden parent reload recovery; native resize, per-layout size memory, unchanged timers, pause/resume, extension and exactly one recording per timer; denied external popup/invalid configuration',
  );
  console.log(`Screenshots: ${output}`);
  if (show) {
    await restartedStation.getByRole('button', { name: '纵向', exact: true }).click();
    await resizeStation(240, 500, 411);
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
          minimized: window.isMinimized(),
          size: window.getContentSize(),
          bounds: window.getBounds(),
          zoom: window.webContents.getZoomFactor(),
        })),
      ),
    );
    console.error(
      'Station native events:',
      await application.evaluate(() => globalThis.higStationEvents ?? []),
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
        if (page.url().includes('timer-station'))
          console.error(
            'Station clicks:',
            await page.evaluate(() => window.higStationClicks ?? []),
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
