/** @fileoverview 仅对本地 Supabase 执行真实多会话并发和 Realtime 验收，测试结束清理临时账号。 */
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const statusResult = spawnSync(
  process.platform === 'win32'
    ? 'node_modules\\.bin\\supabase.cmd'
    : 'node_modules/.bin/supabase',
  ['status', '-o', 'json'],
  { shell: process.platform === 'win32', encoding: 'utf8' },
);
if (statusResult.status !== 0)
  throw new Error(
    '本地 Supabase 未运行。请先运行 pnpm supabase:start；此测试不会连接正式项目。',
  );
const status = JSON.parse(statusResult.stdout.slice(statusResult.stdout.indexOf('{')));
if (!['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname))
  throw new Error('Refusing non-local Supabase');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const accounts = [];
let room;
/** 普通会话通过正式 RPC 执行命令；错误交由测试断言。 */
async function cmd(user, action, payload, request = crypto.randomUUID()) {
  return user.client.rpc('together_command', {
    p_request_id: request,
    p_action: action,
    p_payload: payload,
  });
}
/** 成功路径必须收到服务端结果。 */
async function success(promise) {
  const result = await promise;
  if (result.error) throw result.error;
  return result.data;
}
try {
  for (let i = 0; i < 3; i++) {
    const email = `together-${crypto.randomUUID()}@example.test`;
    const password = `Test-${crypto.randomUUID()}!aA1`;
    const data = await success(
      admin.auth.admin.createUser({ email, password, email_confirm: true }),
    );
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    accounts.push({ id: data.user.id, client });
    const signedIn = await success(client.auth.signInWithPassword({ email, password }));
    await client.realtime.setAuth(signedIn.session.access_token);
    await success(cmd(accounts[i], 'profile', { name: `本地成员${i}` }));
  }
  const [a, b, c] = accounts;
  const invite = await success(cmd(a, 'invite', { relationship: 'couple' }));
  const racers = await Promise.all([
    cmd(b, 'accept_invite', { id: invite.id }),
    cmd(c, 'accept_invite', { id: invite.id }),
  ]);
  assert.equal(
    racers.filter((item) => !item.error).length,
    1,
    'concurrent invite acceptance must have one winner',
  );
  room = racers.find((item) => !item.error).data;
  const partner = room.user_b === b.id ? b : c;
  const outsider = partner === b ? c : b;
  assert.equal(
    (await success(outsider.client.from('together_rooms').select('*'))).length,
    0,
  );
  let observed = 0;
  const channel = partner.client.channel('together-integration').on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'together_rooms',
      filter: `id=eq.${room.id}`,
    },
    () => observed++,
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Realtime subscription timeout')),
      20000,
    );
    channel.subscribe((state) => {
      if (state === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  const flag = (
    await success(
      cmd(a, 'create_flag', {
        room_id: room.id,
        title: '真实并发验收',
        deadline: new Date(Date.now() + 3600000).toISOString(),
        timezone: 'Asia/Shanghai',
      }),
    )
  ).flag;
  const submitted = (
    await success(
      cmd(a, 'submit', {
        room_id: room.id,
        flag_id: flag.id,
        version: flag.version,
        wechat_sent: true,
      }),
    )
  ).flag;
  const reviews = await Promise.all([
    cmd(partner, 'approve', {
      room_id: room.id,
      flag_id: flag.id,
      version: submitted.version,
      expected_submission_id: submitted.current_submission_id,
    }),
    cmd(partner, 'changes', {
      room_id: room.id,
      flag_id: flag.id,
      version: submitted.version,
      expected_submission_id: submitted.current_submission_id,
      body: '并行补充请求',
    }),
  ]);
  assert.equal(
    reviews.filter((item) => !item.error).length,
    1,
    'concurrent reviews must have one winner',
  );
  const end = Date.now() + 15000;
  while (!observed && Date.now() < end)
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(observed > 0, 'partner must receive room changes through Realtime');
  await partner.client.removeChannel(channel);
  console.log(
    'Local Supabase: concurrent exclusive binding, concurrent review, third-account isolation and Realtime passed.',
  );
} finally {
  const ids = accounts.map((user) => user.id);
  if (room) {
    await success(admin.from('together_requests').delete().in('actor', ids));
    await success(
      admin
        .from('together_flags')
        .update({ current_submission_id: null })
        .eq('room_id', room.id),
    );
    await success(admin.from('together_events').delete().eq('room_id', room.id));
    await success(admin.from('together_flags').delete().eq('room_id', room.id));
    await success(admin.from('together_memberships').delete().eq('room_id', room.id));
    await success(admin.from('together_rooms').delete().eq('id', room.id));
  }
  if (ids.length) {
    await success(admin.from('together_invites').delete().in('creator', ids));
    await success(admin.from('together_requests').delete().in('actor', ids));
  }
  for (const user of accounts) {
    user.client.realtime.disconnect();
    await admin.auth.admin.deleteUser(user.id);
  }
  admin.realtime.disconnect();
}
