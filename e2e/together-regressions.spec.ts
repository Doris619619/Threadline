/** @fileoverview 用真实页面与本地 RPC 复现跨查询旧缓存、离线草稿重试和异常日期隔离。 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import type { CommandResult, Flag, Room } from '../src/features/together/types';
const api = 'http://127.0.0.1:3102/rest/v1';
const owner = '22222222-2222-4222-8222-222222222222';
const reviewer = '11111111-1111-4111-8111-111111111111';

/** 固定本地测试身份调用真实 RPC，绝不访问生产账号或绕过状态机。 */
async function command(
  request: APIRequestContext,
  user: string,
  action: string,
  payload: Record<string, unknown>,
) {
  const response = await request.post(`${api}/rpc/together_command`, {
    headers: { 'x-preview-user': user },
    data: { p_request_id: crypto.randomUUID(), p_action: action, p_payload: payload },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as CommandResult;
}

/** 通过已有本地空间创建独立目标，避免依赖其他测试的提交版本。 */
async function createFlag(request: APIRequestContext, user: string, title: string) {
  const response = await request.get(`${api}/together_rooms?ended_at=is.null`, {
    headers: { 'x-preview-user': user },
  });
  const [room] = (await response.json()) as Room[];
  return (
    await command(request, user, 'create_flag', {
      room_id: room.id,
      title,
      deadline: '2026-10-01T14:00:00Z',
      timezone: 'Asia/Shanghai',
    })
  ).flag!;
}

/** 固定版本和成果指针模拟另一个设备操作；正式验收 RPC 仍需自行核对。 */
function target(flag: Flag) {
  return {
    room_id: flag.room_id,
    flag_id: flag.id,
    version: flag.version,
    expected_submission_id: flag.current_submission_id,
  };
}

test('新 flag 先返回、成果查询仍保留旧缓存时禁止验收', async ({ page, request }) => {
  const title = `提交绑定回归 ${Date.now()}`;
  let flag = await createFlag(request, owner, title);
  flag = (
    await command(request, owner, 'submit', {
      ...target(flag),
      wechat_sent: true,
      body: '旧成果 S1',
    })
  ).flag!;
  await page.goto('/together-preview');
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('region', { name: '最新成果' })).toContainText(
    '旧成果 S1',
  );
  const firstId = flag.current_submission_id;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  // 后台刷新可继续持有 S1 缓存；明确控制响应次序，不使用概率性的 sleep。
  await page.route('**/rest/v1/together_events?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('flag_id') === `eq.${flag.id}`)
      await held;
    await route.continue();
  });
  try {
    flag = (
      await command(request, reviewer, 'changes', {
        ...target(flag),
        body: '请补充 S2',
      })
    ).flag!;
    flag = (
      await command(request, owner, 'submit', {
        ...target(flag),
        wechat_sent: true,
        body: '新成果 S2',
      })
    ).flag!;
    expect(flag.current_submission_id).not.toBe(firstId);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page.getByRole('status').filter({ hasText: '正在核对本次成果' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: '最新成果' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '我看见啦，真的很棒 ❤️', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '还差一点点，再给我看看嘛。', exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole('region', { name: '最新成果' })).toContainText(
    '新成果 S2',
  );
  await page
    .getByRole('button', { name: '我看见啦，真的很棒 ❤️', exact: true })
    .click();
  const sent = page.waitForRequest(
    (req) =>
      req.url().endsWith('/rpc/together_command') &&
      req.postDataJSON()?.p_action === 'approve',
  );
  await page
    .getByRole('dialog', { name: '我看见啦，真的很棒 ❤️' })
    .getByRole('button', { name: '我看见啦，真的很棒 ❤️' })
    .click();
  expect((await sent).postDataJSON().p_payload.expected_submission_id).toBe(
    flag.current_submission_id,
  );
  await expect(page.getByRole('dialog', { name: title })).toContainText('已验收通过');
});

test('离线提交后修改目标，联网重试仅创建修改后的一条', async ({
  page,
  context,
  request,
}) => {
  await page.goto('/together-preview');
  await page.getByRole('button', { name: '立个 flag', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '立个 flag', exact: true });
  const title = `离线重试 ${Date.now()}`;
  let writes = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/rpc/together_command')) writes++;
  });
  await editor.getByRole('textbox', { name: '目标', exact: true }).fill(`${title} 50`);
  await context.setOffline(true);
  await editor.getByRole('button', { name: '立下 flag', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('当前离线');
  expect(writes).toBe(0);
  await editor.getByRole('textbox', { name: '目标', exact: true }).fill(`${title} 60`);
  await context.setOffline(false);
  await editor.getByRole('button', { name: '立下 flag', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(writes).toBe(1);
  const response = await request.get(`${api}/together_flags`, {
    headers: { 'x-preview-user': reviewer },
  });
  const saved = ((await response.json()) as Flag[]).filter((flag) =>
    flag.title.startsWith(title),
  );
  expect(saved.map((flag) => flag.title)).toEqual([`${title} 60`]);
});

test('异常截止时间只提示该记录，列表、详情和编辑器仍可使用', async ({
  page,
  request,
}) => {
  const title = `异常日期 ${Date.now()}`;
  const flag = await createFlag(request, reviewer, title);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // 模拟升级前存储的异常记录；新写入已由 SQL 约束阻止。
  await page.route('**/rest/v1/together_flags?**', async (route) => {
    if (route.request().method() === 'HEAD') return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    const corrupt = (row: Flag) =>
      row.id === flag.id ? { ...row, deadline: 'infinity' } : row;
    await route.fulfill({
      response,
      json: Array.isArray(data) ? data.map(corrupt) : corrupt(data),
    });
  });
  await page.goto('/together-preview');
  const card = page
    .locator('.together-note')
    .filter({ has: page.getByRole('button', { name: title, exact: true }) });
  await expect(card).toContainText('时间数据异常');
  await expect(
    page.getByRole('button', { name: '背完雅思 Unit 3，完成一次默写', exact: true }),
  ).toBeVisible();
  await card.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('时间数据异常');
  await page.getByRole('button', { name: '编辑约定', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑 flag', exact: true });
  await expect(editor.getByRole('alert')).toContainText('重新填写截止时间');
  await expect(editor.getByLabel('截止时间')).toHaveValue('');
  expect(errors).toEqual([]);
});
