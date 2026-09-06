/** @fileoverview 用隔离本地 Supabase 验证预计流转、生理期并发约束、RLS 与双客户端 Realtime。 */

import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

/** 在集成检查失败时保留最接近业务语义的错误信息。 */
function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** 读取本地 Supabase 连接信息，不输出测试 secret。 */
function readLocalStatus() {
  const command =
    process.platform === 'win32'
      ? 'node_modules\\.bin\\supabase.cmd'
      : 'node_modules/.bin/supabase';
  const result = spawnSync(
    command,
    [
      'status',
      '-o',
      'json',
      ...(process.env.THREADLINE_SUPABASE_WORKDIR
        ? ['--workdir', process.env.THREADLINE_SUPABASE_WORKDIR]
        : []),
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );
  if (result.status !== 0)
    throw new Error(`Supabase status failed: ${result.stderr || result.stdout}`);
  const jsonStart = result.stdout.indexOf('{');
  check(jsonStart >= 0, 'Supabase status did not return JSON.');
  return JSON.parse(result.stdout.slice(jsonStart));
}

/** 生成一个已验证邮箱的 publishable-key 客户端。 */
async function createSignedInUser(admin, status, email, password) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  check(signedIn.data.session, 'Temporary account did not receive a session.');
  await client.realtime.setAuth(signedIn.data.session.access_token);
  return { id: created.data.user.id, client };
}

/** 等待 Realtime channel 完成订阅；超时保留可定位的 owner scope 诊断。 */
function subscribe(channel, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${label} Realtime subscribe timed out.`)),
      20_000,
    );
    channel.subscribe((state) => {
      if (state !== 'SUBSCRIBED') return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

const status = readLocalStatus();
check(
  ['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname),
  'Integration requires local Supabase.',
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Period-${suffix}-Aa1!`;
const users = [];
let observer;
let channel;
/** 成功返回数据，失败立即终止且只输出数据库诊断。 */
function data(response) {
  if (response.error) throw response.error;
  return response.data;
}
try {
  const owner = await createSignedInUser(
    admin,
    status,
    `period-a-${suffix}@example.test`,
    password,
  );
  users.push(owner);
  const other = await createSignedInUser(
    admin,
    status,
    `period-b-${suffix}@example.test`,
    password,
  );
  users.push(other);
  data(await owner.client.rpc('initialize_workspace'));
  const project = data(
    await owner.client.from('projects').select('id').limit(1).single(),
  );
  let task = data(
    await owner.client
      .from('tasks')
      .insert({
        project_id: project.id,
        title: 'Independent estimate',
        status: 'waiting',
        planned_duration_minutes: 90,
      })
      .select()
      .single(),
  );
  for (const [transition, date] of [
    ['scheduled', '2026-08-01'],
    ['rescheduled', '2026-08-02'],
    ['waiting', null],
    ['scheduled', '2026-08-02'],
  ]) {
    task = data(
      await owner.client.rpc('transition_task', {
        p_task_id: task.id,
        p_transition: transition,
        p_target_date: date,
      }),
    );
    check(task.planned_duration_minutes === 90, `${transition} cleared estimate`);
  }
  data(
    await owner.client
      .from('tasks')
      .update({ actual_duration_minutes: 30 })
      .eq('id', task.id),
  );
  const ledgerBefore = data(
    await owner.client
      .from('task_time_entries')
      .select('id,entry_date,minutes')
      .eq('task_id', task.id),
  );
  data(
    await owner.client.rpc('close_day', {
      p_close_date: '2026-08-02',
      p_actions: [{ task_id: task.id, action: 'waiting' }],
      p_project_minutes: {},
    }),
  );
  task = data(await owner.client.from('tasks').select().eq('id', task.id).single());
  check(
    task.status === 'waiting' && task.planned_duration_minutes === 90,
    'close_day cleared estimate',
  );
  task = data(
    await owner.client.rpc('complete_waiting_task', {
      p_task_id: task.id,
      p_completed_date: '2026-08-03',
    }),
  );
  check(
    task.completed && task.planned_duration_minutes === 90,
    'completion cleared estimate',
  );
  const ledgerAfter = data(
    await owner.client
      .from('task_time_entries')
      .select('id,entry_date,minutes')
      .eq('task_id', task.id),
  );
  check(
    JSON.stringify(ledgerBefore) === JSON.stringify(ledgerAfter),
    'Estimate workflow changed actual ledger',
  );

  observer = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
  const session = data(await owner.client.auth.getSession()).session;
  data(
    await observer.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }),
  );
  await observer.realtime.setAuth(session.access_token);
  const events = [];
  channel = observer.channel(`period-observer-${suffix}`).on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'period_records',
      filter: `owner_id=eq.${owner.id}`,
    },
    (payload) => events.push(payload),
  );
  await subscribe(channel, 'Second client');
  // 新启动本地 Realtime 的 CDC 初始化晚于 SUBSCRIBED；与现有集成套件保持同一启动等待。
  await new Promise((resolve) => setTimeout(resolve, 8000));
  const period = data(
    await owner.client
      .from('period_records')
      .insert({ start_date: '2026-08-01' })
      .select()
      .single(),
  );
  await waitUntil(
    () =>
      events.some(
        (event) => event.eventType === 'INSERT' && event.new.id === period.id,
      ),
    'Period insert was not synchronized',
  );
  const readOther = data(await other.client.from('period_records').select('*'));
  check(readOther.length === 0, 'RLS leaked private periods');
  const forged = await other.client
    .from('period_records')
    .insert({ owner_id: owner.id, start_date: '2026-07-01', end_date: '2026-07-02' });
  check(forged.error?.code === '42501', 'RLS allowed forged ownership');
  const overlap = await owner.client
    .from('period_records')
    .insert({ start_date: '2026-08-02' });
  check(overlap.error?.code === '23P01', 'Two ongoing periods were allowed');
  data(
    await owner.client
      .from('period_records')
      .update({ end_date: '2026-08-05' })
      .eq('id', period.id),
  );
  await waitUntil(
    () => events.some((event) => event.new.end_date === '2026-08-05'),
    'Period ending was not synchronized',
  );
  check(
    data(
      await observer
        .from('period_records')
        .select('end_date')
        .eq('id', period.id)
        .single(),
    ).end_date === '2026-08-05',
    'Second client sees stale period',
  );
  for (const values of [
    { start_date: '2026-07-05', end_date: '2026-07-04' },
    { start_date: '2999-01-01' },
  ]) {
    const invalid = await owner.client.from('period_records').insert(values);
    check(invalid.error?.code === '23514', 'Invalid period dates accepted');
  }
  data(
    await owner.client
      .from('rhythm_marks')
      .insert({ mark_date: '2026-07-01', marked: true }),
  );
  data(
    await owner.client
      .from('period_records')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', period.id),
  );
  await waitUntil(
    () => events.some((event) => event.new.id === period.id && event.new.deleted_at),
    'Soft delete was not synchronized',
  );
  check(
    data(await owner.client.from('rhythm_marks').select('marked').single()).marked,
    'Legacy mark was altered',
  );
  const attempts = await Promise.all([
    owner.client
      .from('period_records')
      .insert({ start_date: '2026-08-01', end_date: '2026-08-05' }),
    observer
      .from('period_records')
      .insert({ start_date: '2026-08-03', end_date: '2026-08-07' }),
  ]);
  check(
    attempts.filter((result) => !result.error).length === 1 &&
      attempts.some((result) => result.error?.code === '23P01'),
    'Concurrent overlap was not rejected atomically',
  );
  const erase = await owner.client.from('period_records').delete().eq('id', period.id);
  check(erase.error?.code === '42501', 'Client can hard-delete period history');
  console.log(
    'PASS: independent estimates through schedule/reschedule/waiting/close/complete; unchanged ledger; periods CRUD, RLS, future/date/overlap/concurrency guards, legacy marks and second-client Realtime.',
  );
} finally {
  if (observer && channel) await observer.removeChannel(channel);
  observer?.realtime.disconnect();
  for (const user of users) {
    user.client.realtime.disconnect();
    await user.client.auth.signOut();
    data(await admin.auth.admin.deleteUser(user.id));
  }
  admin.realtime.disconnect();
}
/** 等待真实状态，超时失败；不以固定延时冒充同步成功。 */
async function waitUntil(predicate, message) {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    check(Date.now() < deadline, message);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
