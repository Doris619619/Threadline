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
  const anonymous = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
  const anonymousProjects = await anonymous.from('projects').select('id');
  check(
    anonymousProjects.error?.code === '42501',
    'Anon must not receive business-table SELECT privileges.',
  );
  const anonymousInitializer = await anonymous.rpc('initialize_workspace');
  check(
    anonymousInitializer.error?.code === '42501',
    'Anon must not receive workspace RPC EXECUTE privileges.',
  );
  anonymous.realtime.disconnect();

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

  const timeTracked = await ownerA.client
    .from('tasks')
    .insert({
      project_id: projectA.id,
      title: 'Date-bound actual probe',
      scheduled_date: '2026-08-30',
      actual_duration_minutes: 40,
      completed: false,
      status: 'active',
    })
    .select('id')
    .single();
  if (timeTracked.error) throw timeTracked.error;
  const rescheduledActual = await ownerA.client
    .from('tasks')
    .update({ scheduled_date: '2026-08-31', actual_duration_minutes: 120 })
    .eq('id', timeTracked.data.id)
    .select('id')
    .single();
  if (rescheduledActual.error) throw rescheduledActual.error;
  const timeEntries = await ownerA.client
    .from('task_time_entries')
    .select('entry_date, minutes')
    .eq('task_id', timeTracked.data.id)
    .order('entry_date');
  if (timeEntries.error) throw timeEntries.error;
  check(
    JSON.stringify(timeEntries.data) ===
      JSON.stringify([
        { entry_date: '2026-08-30', minutes: 40 },
        { entry_date: '2026-08-31', minutes: 80 },
      ]),
    'Task actual time drifted when its scheduled date changed.',
  );
  const completed = await ownerA.client
    .from('tasks')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq('id', timeTracked.data.id);
  if (completed.error) throw completed.error;
  const reopened = await ownerA.client
    .from('tasks')
    .update({ completed: false, completed_at: null })
    .eq('id', timeTracked.data.id);
  if (reopened.error) throw reopened.error;
  const completionHistory = await ownerA.client
    .from('history_events')
    .select('event_type')
    .eq('task_id', timeTracked.data.id)
    .in('event_type', ['completed', 'reopened'])
    .order('occurred_at');
  if (completionHistory.error) throw completionHistory.error;
  check(
    JSON.stringify(completionHistory.data) ===
      JSON.stringify([{ event_type: 'completed' }, { event_type: 'reopened' }]),
    'Task completion transitions did not produce exactly one formal history event each.',
  );

  const templateUpdate = await ownerA.client.rpc('update_daily_template_bundle', {
    p_template_id: template.data.id,
    p_project_id: projectA.id,
    p_title: 'Updated Daily template',
    p_items: [{ id: templateItem.data?.id ?? null, title: 'Updated child', position: 0 }],
  });
  if (templateUpdate.error) throw templateUpdate.error;
  const futureMaterialized = await ownerA.client.rpc('ensure_daily_entries_for_date', {
    p_entry_date: '2026-08-31',
  });
  if (futureMaterialized.error) throw futureMaterialized.error;
  const snapshots = await ownerA.client
    .from('daily_entries')
    .select('entry_date, title_snapshot')
    .eq('template_id', template.data.id)
    .order('entry_date');
  if (snapshots.error) throw snapshots.error;
  check(
    JSON.stringify(snapshots.data) ===
      JSON.stringify([
        { entry_date: '2026-08-30', title_snapshot: 'Concurrent Daily' },
        { entry_date: '2026-08-31', title_snapshot: 'Updated Daily template' },
      ]),
    'Daily template edit did not preserve history while changing future instances.',
  );

  console.log('Local Supabase Auth/privileges/RLS/Realtime/Daily integration passed.');
} finally {
  for (const [client, channel] of channels) await client.removeChannel(channel);
  for (const user of users) {
    await user.client.auth.signOut();
    user.client.realtime.disconnect();
    await admin.auth.admin.deleteUser(user.id);
  }
  admin.realtime.disconnect();
}
