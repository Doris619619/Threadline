/**
 * @fileoverview 针对本地 Supabase 验证 Email/password、RLS、Realtime、Rhythm 与 Daily 幂等闭环。
 */

import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

/** 失败时保留最接近业务语义的断言信息。 */
function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** 读取本地 Supabase 状态，但不打印返回的本地测试 secret。 */
function readLocalStatus() {
  const command =
    process.platform === 'win32'
      ? 'node_modules\\.bin\\supabase.cmd'
      : 'node_modules/.bin/supabase';
  const result = spawnSync(command, ['status', '-o', 'json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0)
    throw new Error(`Supabase status failed: ${result.stderr || result.stdout}`);
  const jsonStart = result.stdout.indexOf('{');
  check(jsonStart >= 0, 'Supabase status did not return JSON.');
  return JSON.parse(result.stdout.slice(jsonStart));
}

/** 在限定时间内等待 Realtime channel 完成订阅。 */
function subscribe(channel, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${label} Realtime subscribe timed out.`)),
      20_000,
    );
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

/** 在限定时间内等待预期 Realtime row change。 */
function waitForEvent(register, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${label} Realtime event timed out.`)),
      30_000,
    );
    register(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

const status = readLocalStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Threadline-${suffix}-Aa1!`;
const users = [];
const channels = [];

try {
  for (const account of ['a', 'b']) {
    const email = `threadline-${account}-${suffix}@example.test`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    check(created.data.user, `Failed to create account ${account}.`);
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    check(signedIn.data.session, `Account ${account} did not receive a session.`);
    await client.realtime.setAuth(signedIn.data.session.access_token);
    users.push({ id: created.data.user.id, client });
  }

  const [ownerA, ownerB] = users;
  for (const owner of users) {
    const initialized = await owner.client.rpc('initialize_workspace');
    if (initialized.error) throw initialized.error;
    check(initialized.data.length === 5, 'Each account must receive five projects.');
  }

  const projectsA = await ownerA.client.from('projects').select('*').order('position');
  if (projectsA.error) throw projectsA.error;
  const projectA = projectsA.data[0];
  const projectsB = await ownerB.client
    .from('projects')
    .select('id', { count: 'exact', head: true });
  if (projectsB.error) throw projectsB.error;
  check(projectsB.count === 5, 'Account B must see only its five projects.');

  const taskA = await ownerA.client
    .from('tasks')
    .insert({
      project_id: projectA.id,
      title: 'Realtime owner scope probe',
      scheduled_date: '2026-08-30',
      completed: false,
      status: 'active',
    })
    .select('id')
    .single();
  if (taskA.error) throw taskA.error;
  const tasksB = await ownerB.client
    .from('tasks')
    .select('id', { count: 'exact', head: true });
  if (tasksB.error) throw tasksB.error;
  check(tasksB.count === 0, 'RLS leaked account A task to account B.');
  const crossUpdate = await ownerB.client
    .from('projects')
    .update({ name: 'Cross-account write must not happen' })
    .eq('id', projectA.id)
    .select('id');
  if (crossUpdate.error) throw crossUpdate.error;
  check(crossUpdate.data.length === 0, 'RLS allowed account B to update account A.');

  let resolveOwnerEvent;
  let foreignEvents = 0;
  const ownerEvent = waitForEvent((resolve) => {
    resolveOwnerEvent = resolve;
  }, 'owner-scoped project update');
  const channelA = ownerA.client.channel(`integration-a-${suffix}`).on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'projects',
      filter: `owner_id=eq.${ownerA.id}`,
    },
    () => resolveOwnerEvent(),
  );
  const channelB = ownerB.client.channel(`integration-b-${suffix}`).on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'projects',
      filter: `owner_id=eq.${ownerB.id}`,
    },
    () => {
      foreignEvents += 1;
    },
  );
  channels.push([ownerA.client, channelA], [ownerB.client, channelB]);
  await Promise.all([
    subscribe(channelA, 'Account A'),
    subscribe(channelB, 'Account B'),
  ]);
  // 本地 db reset 会重启 Realtime；SUBSCRIBED 可能早于冷 CDC 流完全 ready。
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  const updated = await ownerA.client
    .from('projects')
    .update({ name: 'Realtime owner scope verified' })
    .eq('id', projectA.id)
    .select()
    .single();
  if (updated.error) throw updated.error;
  await ownerEvent;
  await new Promise((resolve) => setTimeout(resolve, 500));
  check(foreignEvents === 0, 'Account B received account A Realtime event.');

  const rhythm = await ownerA.client
    .from('rhythm_marks')
    .insert({ mark_date: '2026-08-30', marked: true })
    .select()
    .single();
  if (rhythm.error) throw rhythm.error;
  const rhythmB = await ownerB.client
    .from('rhythm_marks')
    .select('id', { count: 'exact', head: true });
  if (rhythmB.error) throw rhythmB.error;
  check(rhythmB.count === 0, 'RLS leaked account A Rhythm to account B.');

  const template = await ownerA.client
    .from('daily_templates')
    .insert({
      project_id: projectA.id,
      title: 'Concurrent Daily',
      is_active: true,
      position: 0,
    })
    .select()
    .single();
  if (template.error) throw template.error;
  const templateItem = await ownerA.client.from('daily_template_items').insert({
    template_id: template.data.id,
    title: 'Snapshot child',
    position: 0,
  });
  if (templateItem.error) throw templateItem.error;
  const materialized = await Promise.all([
    ownerA.client.rpc('ensure_daily_entries_for_date', {
      p_entry_date: '2026-08-30',
    }),
    ownerA.client.rpc('ensure_daily_entries_for_date', {
      p_entry_date: '2026-08-30',
    }),
  ]);
  for (const response of materialized) if (response.error) throw response.error;
  const entries = await ownerA.client
    .from('daily_entries')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', template.data.id)
    .eq('entry_date', '2026-08-30');
  if (entries.error) throw entries.error;
  check(entries.count === 1, 'Concurrent Daily materialization created duplicates.');

  console.log('Local Supabase Auth/RLS/Realtime/Daily integration passed.');
} finally {
  for (const [client, channel] of channels) await client.removeChannel(channel);
  for (const user of users) {
    await user.client.auth.signOut();
    user.client.realtime.disconnect();
    await admin.auth.admin.deleteUser(user.id);
  }
  admin.realtime.disconnect();
}
