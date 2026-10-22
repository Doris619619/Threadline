/** @fileoverview 在完整 Preview 中用同源双标签验收计时锁、并发暂停、删除续时竞争及启动约束。 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { TaskTimer } from '../src/features/tasks/timer-rules';
import { openTaskMenu, openWorkspaceSection } from './support/workspace';

const fixedNow = Date.parse('2026-10-21T08:00:00Z');
const minute = 60000;
const timerStorageKey = 'threadline.preview-demo.v1:threadline.task-timers.v1:local';
const taskStorageKey = 'threadline.preview-demo.v1:threadline.tasks.v1';
const entryStorageKey = 'threadline.preview-demo.v1:threadline.task-time-entries.v1';
const recordingStorageKey =
  'threadline.preview-demo.v1:threadline.task-timer-records.v1';
const timerLockName = 'threadline:state:' + timerStorageKey;

type LockHolderWindow = Window & { releaseTimerAuditLock?: () => void };

/** 仅桌面项目执行跨标签竞争；手机和 WebKit 的单页流程沿用 ui-task-time 覆盖。 */
test.beforeEach(({ browserName }, info) => {
  test.skip(
    info.project.name !== 'preview-desktop' || browserName !== 'chromium',
    '双标签并发验收在桌面 Chrome 执行',
  );
});

/** 等待真实首页水合，固定 Date 而保留浏览器计时调度，避免锁和 React 效果被暂停。 */
async function openPreview(page: Page) {
  await page.clock.install({ time: fixedNow });
  await page.clock.setFixedTime(fixedNow);
  await page.goto('/');
  await expect(page.getByTestId('home-panel').locator('.schedule-panel')).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key) !== null, taskStorageKey),
    )
    .toBe(true);
}

/** 仅向 Preview 命名空间恢复有效演示会话，再让两个完整页面各自水合相同状态。 */
async function restoreTimerPages(
  page: Page,
  options: { count: number; running?: boolean; expiredFirst?: boolean },
) {
  await openPreview(page);
  const titles = await page.evaluate(
    ({
      options,
      fixedNow,
      minute,
      timerStorageKey,
      taskStorageKey,
      entryStorageKey,
      recordingStorageKey,
    }) => {
      const tasks = JSON.parse(localStorage.getItem(taskStorageKey)!);
      const selected = [0, 1, 2, 3].map((index) => {
        const task = tasks.find(
          (task: { id: string }) => task.id === 'demo-stage-time-task-' + index,
        );
        if (!task) throw new Error(`演示缺少第 ${index + 1} 个计时任务`);
        task.completed = false;
        task.status = 'waiting';
        task.actualDurationMinutes = undefined;
        return task;
      });
      localStorage.setItem(taskStorageKey, JSON.stringify(tasks));
      localStorage.setItem(entryStorageKey, '[]');
      localStorage.setItem(recordingStorageKey, '[]');
      localStorage.setItem(
        timerStorageKey,
        JSON.stringify(
          selected.slice(0, options.count).map((task, index) => {
            const expired = options.expiredFirst && index === 0;
            const running = options.running && !expired;
            return {
              id: 'concurrency-timer-' + index,
              taskId: task.id,
              title: task.title,
              mode: expired ? 'down' : 'up',
              targetMs: (expired ? 5 : 25) * minute,
              elapsedMs: running ? 0 : 5 * minute,
              ...(running ? { startedAt: fixedNow - 5 * minute } : {}),
              firstStartedAt: fixedNow - 5 * minute,
              entryDate: '2026-10-21',
              intervals: running
                ? []
                : [{ start: fixedNow - 5 * minute, end: fixedNow }],
              timezone: 'Asia/Shanghai',
            };
          }),
        ),
      );
      return selected.map((task: { title: string }) => task.title);
    },
    {
      options,
      fixedNow,
      minute,
      timerStorageKey,
      taskStorageKey,
      entryStorageKey,
      recordingStorageKey,
    },
  );
  await page.reload();
  await expect(page.locator('.task-timer')).toHaveCount(options.count);
  const other = await page.context().newPage();
  await openPreview(other);
  await expect(other.locator('.task-timer')).toHaveCount(options.count);
  return { other, titles };
}

/** 通过卡片的真实可访问名称定位同一任务，避免多计时器时依赖渲染顺序。 */
function timerCard(page: Page, title: string) {
  return page.getByRole('article', { name: '计时 ' + title, exact: true });
}

/** 直接读取完整持久化数组，检查页面显示之外的累计、时段、唯一性和删除结果。 */
async function readTimers(page: Page): Promise<TaskTimer[]> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '[]'),
    timerStorageKey,
  );
}

/** 计时控制不得提前修改任务、原始账本或已保存区间；保留实际存储值供操作前后比较。 */
async function readBusiness(page: Page) {
  return page.evaluate(
    (keys) => keys.map((key) => localStorage.getItem(key)),
    [taskStorageKey, entryStorageKey, recordingStorageKey],
  );
}

/** 持有产品同名 Web Lock，把两次真实 UI 请求一起排队；释放前应没有任何存储写入。 */
async function raceWhileLocked(page: Page, first: Locator, second: Locator) {
  const before = await readTimers(page);
  await page.evaluate(async (lockName) => {
    let acquired!: () => void;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    void navigator.locks.request(lockName, async () => {
      acquired();
      await new Promise<void>((resolve) => {
        (window as LockHolderWindow).releaseTimerAuditLock = resolve;
      });
    });
    await ready;
  }, timerLockName);
  try {
    // 同时发送两页事件；Date.now 固定为相同毫秒，两个处理器均须在持锁期间等待。
    await Promise.all([first.dispatchEvent('click'), second.dispatchEvent('click')]);
    await expect
      .poll(async () =>
        page.evaluate(async (lockName) => {
          const state = await navigator.locks.query();
          return state.pending?.filter((lock) => lock.name === lockName).length ?? 0;
        }, timerLockName),
      )
      .toBe(2);
    expect(await readTimers(page)).toEqual(before);
  } finally {
    await page.evaluate(() => {
      (window as LockHolderWindow).releaseTimerAuditLock?.();
      delete (window as LockHolderWindow).releaseTimerAuditLock;
    });
  }
}

/** 从演示阶段的真实任务菜单打开设置；同时提交前两页都保留各自的启动意图。 */
async function openTimerSettings(page: Page, index: number) {
  await openWorkspaceSection(page, '计划');
  await page
    .getByRole('button', { name: '查看阶段 多项目时间验收', exact: true })
    .click();
  const row = page
    .locator(`[data-stage-task-id="demo-stage-time-task-${index}"]`)
    .filter({ visible: true });
  await openTaskMenu(
    row.getByRole('button', { name: /更多操作/, includeHidden: true }),
  );
  await page.getByRole('menuitem', { name: '加入计时', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '加入计时', exact: true });
  await expect(dialog).toBeVisible();
  return dialog.getByRole('button', { name: '开始计时', exact: true });
}

/** 返回首页后检查两页读到相同计时器，再刷新确认没有只停留在 React 内存。 */
async function expectBothViews(page: Page, other: Page, timers: TaskTimer[]) {
  for (const target of [page, other]) {
    const dialog = target.getByRole('dialog', { name: '加入计时', exact: true });
    if (await dialog.isVisible())
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await openWorkspaceSection(target, '首页');
    await expect(target.locator('.task-timer')).toHaveCount(timers.length);
    for (const timer of timers) {
      await expect(timerCard(target, timer.title)).toHaveAttribute(
        'data-running',
        String(timer.startedAt !== undefined),
      );
    }
    await target.reload();
    await expect(target.locator('.task-timer')).toHaveCount(timers.length);
    expect(await readTimers(target)).toEqual(timers);
  }
}

/** 两页暂停不同任务必须合并到整组状态，第三个任务继续运行且五分钟区间没有丢失。 */
test('concurrent pauses preserve both paused timers and the third running timer', async ({
  page,
}) => {
  const { other, titles } = await restoreTimerPages(page, { count: 3, running: true });
  const business = await readBusiness(page);
  await raceWhileLocked(
    page,
    timerCard(page, titles[0]).getByRole('button', { name: '暂停', exact: true }),
    timerCard(other, titles[1]).getByRole('button', { name: '暂停', exact: true }),
  );
  await expect
    .poll(async () =>
      (await readTimers(page)).map((timer) => timer.startedAt !== undefined),
    )
    .toEqual([false, false, true]);
  const timers = await readTimers(page);
  for (const timer of timers.slice(0, 2)) {
    expect(timer.elapsedMs).toBe(5 * minute);
    expect(timer.intervals).toEqual([{ start: fixedNow - 5 * minute, end: fixedNow }]);
  }
  expect(await readBusiness(page)).toEqual(business);
  await expectBothViews(page, other, timers);
  await other.close();
});

/** 同一已到时计时器被删除和续时竞争时，删除最终生效，其他会话与账本保持原值。 */
test('concurrent removal and extension cannot resurrect the expired countdown', async ({
  page,
}) => {
  const { other, titles } = await restoreTimerPages(page, {
    count: 3,
    expiredFirst: true,
  });
  const before = await readTimers(page);
  const business = await readBusiness(page);
  // 桌面隐藏触屏更多按钮；沿用真实用户的卡片右键入口打开删除菜单。
  await timerCard(page, titles[0]).click({ button: 'right' });
  await timerCard(other, titles[0])
    .getByRole('button', { name: '延长', exact: true })
    .click();
  await raceWhileLocked(
    page,
    page.getByRole('menuitem', { name: '删除计时器', exact: true }),
    other
      .getByRole('group', { name: '延长倒计时', exact: true })
      .getByRole('button', { name: '5分钟', exact: true }),
  );
  await expect.poll(() => readTimers(page)).toEqual(before.slice(1));
  expect(await readBusiness(page)).toEqual(business);
  await expectBothViews(page, other, before.slice(1));
  await other.close();
});

for (const scenario of [
  {
    name: 'capacity',
    count: 2,
    first: 2,
    second: 3,
    total: 3,
    error: '最多同时保留三个计时器。',
  },
  {
    name: 'duplicate task',
    count: 1,
    first: 1,
    second: 1,
    total: 2,
    error: '这个任务已加入计时。',
  },
]) {
  /** 两页预先打开设置再竞争启动，锁内规则必须保留暂停名额并拒绝重复任务。 */
  test(`concurrent starts enforce ${scenario.name} after both settings dialogs opened`, async ({
    page,
  }) => {
    const { other } = await restoreTimerPages(page, { count: scenario.count });
    const business = await readBusiness(page);
    const [first, second] = await Promise.all([
      openTimerSettings(page, scenario.first),
      openTimerSettings(other, scenario.second),
    ]);
    await raceWhileLocked(page, first, second);
    await expect.poll(async () => (await readTimers(page)).length).toBe(scenario.total);
    await expect
      .poll(async () => [
        ...(await page.getByRole('alert').allTextContents()),
        ...(await other.getByRole('alert').allTextContents()),
      ])
      .toContain(scenario.error);
    const timers = await readTimers(page);
    expect(new Set(timers.map((timer) => timer.taskId)).size).toBe(scenario.total);
    expect(timers.filter((timer) => timer.startedAt === undefined)).toHaveLength(
      scenario.count,
    );
    expect(await readBusiness(page)).toEqual(business);
    await expectBothViews(page, other, timers);
    await other.close();
  });
}
