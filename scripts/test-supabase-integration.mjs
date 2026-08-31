/**
 * @fileoverview 针对本地 Supabase 验证 Auth/RLS/Realtime、任务实际投入账本与 Daily 原子写入闭环。
 */

import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

/** 失败时保留最接近业务语义的断言信息。 */
function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** 验证数据库拒绝保持稳定 SQLSTATE 与业务错误标识，避免只断言“有错误”。 */
function checkDatabaseError(response, code, marker, context) {
  check(
    response.error?.code === code && response.error.message?.includes(marker) === true,
    `${context}: expected ${code}/${marker}, received ${response.error?.code ?? 'no-code'}/${response.error?.message ?? 'no-error'}.`,
  );
}

/** 从客户端可见的任务账本和 Daily 父子总量独立计算某日项目汇总，用于核对关账触发器。 */
async function readExpectedProjectMinutes(client, date) {
  const [taskEntries, dailyEntries] = await Promise.all([
    client
      .from('task_time_entries')
      .select('project_id, minutes')
      .eq('entry_date', date),
    client.from('daily_entries').select('id, project_id').eq('entry_date', date),
  ]);
  if (taskEntries.error) throw taskEntries.error;
  if (dailyEntries.error) throw dailyEntries.error;
  const totals = {};
  for (const entry of taskEntries.data)
    totals[entry.project_id] = (totals[entry.project_id] ?? 0) + entry.minutes;
  for (const entry of dailyEntries.data) {
    const total = await client.rpc('daily_entry_total_actual', {
      p_entry_id: entry.id,
    });
    if (total.error) throw total.error;
    totals[entry.project_id] = (totals[entry.project_id] ?? 0) + total.data;
  }
  return totals;
}

/** 以稳定顶层 key 顺序序列化记录，避免对象属性顺序影响集成断言。 */
function stableRecord(value) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
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
  const alternateProjectA = projectsA.data[1];
  check(
    projectA && alternateProjectA,
    'Account A did not receive two usable projects.',
  );
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
  const templateItem = await ownerA.client
    .from('daily_template_items')
    .insert({
      template_id: template.data.id,
      title: 'Snapshot child',
      position: 0,
    })
    .select('id')
    .single();
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
    .select('id')
    .eq('template_id', template.data.id)
    .eq('entry_date', '2026-08-30');
  if (entries.error) throw entries.error;
  check(
    entries.data.length === 1,
    'Concurrent Daily materialization created duplicates.',
  );
  const currentEntry = entries.data[0];

  const currentEntryItem = await ownerA.client
    .from('daily_entry_items')
    .select(
      'id, template_item_id, title_snapshot, position, completed, actual_duration_minutes',
    )
    .eq('entry_id', currentEntry.id)
    .single();
  if (currentEntryItem.error) throw currentEntryItem.error;
  const currentTemplateItems = [
    { id: templateItem.data.id, title: 'Snapshot child', position: 0 },
  ];
  const currentEntryItems = [
    {
      id: currentEntryItem.data.id,
      template_item_id: currentEntryItem.data.template_item_id,
      title: currentEntryItem.data.title_snapshot,
      position: currentEntryItem.data.position,
      completed: currentEntryItem.data.completed,
      actual: currentEntryItem.data.actual_duration_minutes,
    },
  ];

  const otherTemplate = await ownerA.client
    .from('daily_templates')
    .insert({
      project_id: projectA.id,
      title: 'Other Daily',
      is_active: true,
      position: 1,
    })
    .select('id')
    .single();
  if (otherTemplate.error) throw otherTemplate.error;
  const otherTemplateItem = await ownerA.client
    .from('daily_template_items')
    .insert({
      template_id: otherTemplate.data.id,
      title: 'Other snapshot child',
      position: 0,
    })
    .select('id')
    .single();
  if (otherTemplateItem.error) throw otherTemplateItem.error;
  const materializedOther = await ownerA.client.rpc('ensure_daily_entries_for_date', {
    p_entry_date: '2026-08-30',
  });
  if (materializedOther.error) throw materializedOther.error;
  const otherEntry = await ownerA.client
    .from('daily_entries')
    .select('id')
    .eq('template_id', otherTemplate.data.id)
    .eq('entry_date', '2026-08-30')
    .single();
  if (otherEntry.error) throw otherEntry.error;
  const otherEntryItem = await ownerA.client
    .from('daily_entry_items')
    .select(
      'id, template_item_id, title_snapshot, position, completed, actual_duration_minutes',
    )
    .eq('entry_id', otherEntry.data.id)
    .single();
  if (otherEntryItem.error) throw otherEntryItem.error;
  const seededOtherEntry = await ownerA.client.rpc('save_daily_entry_bundle', {
    p_entry_id: otherEntry.data.id,
    p_project_id: projectA.id,
    p_title: 'Other Daily',
    p_completed: false,
    p_actual_duration_minutes: 11,
    p_result: '',
    p_items: [
      {
        id: otherEntryItem.data.id,
        template_item_id: otherEntryItem.data.template_item_id,
        title: otherEntryItem.data.title_snapshot,
        position: otherEntryItem.data.position,
        completed: otherEntryItem.data.completed,
        actual: 7,
      },
    ],
  });
  if (seededOtherEntry.error) throw seededOtherEntry.error;

  const currentTotalBeforeMismatch = await ownerA.client.rpc(
    'daily_entry_total_actual',
    {
      p_entry_id: currentEntry.id,
    },
  );
  if (currentTotalBeforeMismatch.error) throw currentTotalBeforeMismatch.error;
  const otherTotalBeforeMismatch = await ownerA.client.rpc('daily_entry_total_actual', {
    p_entry_id: otherEntry.data.id,
  });
  if (otherTotalBeforeMismatch.error) throw otherTotalBeforeMismatch.error;
  check(
    otherTotalBeforeMismatch.data === 18,
    'Other Daily aggregate seed is incorrect.',
  );

  const templateScopeMismatch = await ownerA.client.rpc(
    'update_daily_template_bundle',
    {
      p_template_id: template.data.id,
      p_entry_id: currentEntry.id,
      p_project_id: projectA.id,
      p_title: 'Template scope must roll back',
      p_template_items: [
        { id: otherTemplateItem.data.id, title: 'Foreign template item', position: 0 },
      ],
      p_entry_items: currentEntryItems,
    },
  );
  checkDatabaseError(
    templateScopeMismatch,
    '22023',
    'DAILY_TEMPLATE_ITEM_SCOPE_MISMATCH',
    'Daily template bundle accepted another same-owner template item id',
  );

  const entryScopeMismatch = await ownerA.client.rpc('update_daily_template_bundle', {
    p_template_id: template.data.id,
    p_entry_id: currentEntry.id,
    p_project_id: projectA.id,
    p_title: 'Entry scope must roll back',
    p_template_items: currentTemplateItems,
    p_entry_items: [
      {
        id: otherEntryItem.data.id,
        template_item_id: otherEntryItem.data.template_item_id,
        title: 'Foreign entry item',
        position: 0,
        completed: true,
        actual: 999,
      },
    ],
  });
  checkDatabaseError(
    entryScopeMismatch,
    '22023',
    'DAILY_ENTRY_ITEM_SCOPE_MISMATCH',
    'Daily template bundle accepted another same-owner entry item id',
  );

  const currentTotalAfterMismatch = await ownerA.client.rpc(
    'daily_entry_total_actual',
    {
      p_entry_id: currentEntry.id,
    },
  );
  if (currentTotalAfterMismatch.error) throw currentTotalAfterMismatch.error;
  const otherTotalAfterMismatch = await ownerA.client.rpc('daily_entry_total_actual', {
    p_entry_id: otherEntry.data.id,
  });
  if (otherTotalAfterMismatch.error) throw otherTotalAfterMismatch.error;
  check(
    currentTotalAfterMismatch.data === currentTotalBeforeMismatch.data &&
      otherTotalAfterMismatch.data === otherTotalBeforeMismatch.data,
    'Rejected Daily item scope mismatch changed a current or foreign aggregate.',
  );
  const rolledBackTemplate = await ownerA.client
    .from('daily_templates')
    .select('title')
    .eq('id', template.data.id)
    .single();
  if (rolledBackTemplate.error) throw rolledBackTemplate.error;
  const rolledBackEntry = await ownerA.client
    .from('daily_entries')
    .select('title_snapshot')
    .eq('id', currentEntry.id)
    .single();
  if (rolledBackEntry.error) throw rolledBackEntry.error;
  const untouchedOtherTemplateItem = await ownerA.client
    .from('daily_template_items')
    .select('title')
    .eq('id', otherTemplateItem.data.id)
    .single();
  if (untouchedOtherTemplateItem.error) throw untouchedOtherTemplateItem.error;
  check(
    rolledBackTemplate.data.title === 'Concurrent Daily' &&
      rolledBackEntry.data.title_snapshot === 'Concurrent Daily' &&
      untouchedOtherTemplateItem.data.title === 'Other snapshot child',
    'Rejected Daily item scope mismatch partially committed parent or foreign item changes.',
  );

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
    .select('id, entry_date, minutes')
    .eq('task_id', timeTracked.data.id)
    .order('entry_date');
  if (timeEntries.error) throw timeEntries.error;
  check(
    JSON.stringify(
      timeEntries.data.map(({ entry_date: entryDate, minutes }) => ({
        entry_date: entryDate,
        minutes,
      })),
    ) ===
      JSON.stringify([
        { entry_date: '2026-08-30', minutes: 40 },
        { entry_date: '2026-08-31', minutes: 80 },
      ]),
    'Task actual time drifted when its scheduled date changed.',
  );

  const reducedActual = await ownerA.client
    .from('tasks')
    .update({ actual_duration_minutes: 100 })
    .eq('id', timeTracked.data.id)
    .select('actual_duration_minutes')
    .single();
  if (reducedActual.error) throw reducedActual.error;
  const reducedTimeEntries = await ownerA.client
    .from('task_time_entries')
    .select('id, entry_date, minutes')
    .eq('task_id', timeTracked.data.id)
    .order('entry_date');
  if (reducedTimeEntries.error) throw reducedTimeEntries.error;
  check(
    reducedActual.data.actual_duration_minutes === 100 &&
      JSON.stringify(
        reducedTimeEntries.data.map(({ entry_date: entryDate, minutes }) => ({
          entry_date: entryDate,
          minutes,
        })),
      ) ===
        JSON.stringify([
          { entry_date: '2026-08-30', minutes: 40 },
          { entry_date: '2026-08-31', minutes: 60 },
        ]),
    'Reducing task actual time did not preserve 40 fixed minutes and rebalance the current date to 60.',
  );

  const belowFixedHistory = await ownerA.client
    .from('tasks')
    .update({ actual_duration_minutes: 20 })
    .eq('id', timeTracked.data.id)
    .select('actual_duration_minutes')
    .single();
  checkDatabaseError(
    belowFixedHistory,
    '22023',
    'TASK_ACTUAL_BELOW_FIXED_HISTORY',
    'Task actual time was allowed below immutable dated history',
  );
  const preservedActual = await ownerA.client
    .from('tasks')
    .select('actual_duration_minutes')
    .eq('id', timeTracked.data.id)
    .single();
  if (preservedActual.error) throw preservedActual.error;
  const preservedTimeEntries = await ownerA.client
    .from('task_time_entries')
    .select('entry_date, minutes')
    .eq('task_id', timeTracked.data.id)
    .order('entry_date');
  if (preservedTimeEntries.error) throw preservedTimeEntries.error;
  check(
    preservedActual.data.actual_duration_minutes === 100 &&
      preservedTimeEntries.data.reduce((sum, entry) => sum + entry.minutes, 0) === 100,
    'Rejected task actual reduction changed the aggregate or dated ledger.',
  );

  const directTimeInsert = await ownerA.client.from('task_time_entries').insert({
    owner_id: ownerA.id,
    task_id: timeTracked.data.id,
    entry_date: '2026-09-01',
    project_id: projectA.id,
    minutes: 5,
  });
  check(
    directTimeInsert.error?.code === '42501',
    'Authenticated client received direct task_time_entries INSERT access.',
  );
  const directTimeUpdate = await ownerA.client
    .from('task_time_entries')
    .update({ minutes: 999 })
    .eq('id', reducedTimeEntries.data[0].id);
  check(
    directTimeUpdate.error?.code === '42501',
    'Authenticated client received direct task_time_entries UPDATE access.',
  );
  const directTimeDelete = await ownerA.client
    .from('task_time_entries')
    .delete()
    .eq('id', reducedTimeEntries.data[0].id);
  check(
    directTimeDelete.error?.code === '42501',
    'Authenticated client received direct task_time_entries DELETE access.',
  );

  const undatedTask = await ownerA.client
    .from('tasks')
    .insert({
      project_id: projectA.id,
      title: 'Undated actual rejection probe',
      scheduled_date: null,
      actual_duration_minutes: 0,
      completed: false,
      status: 'active',
    })
    .select('id')
    .single();
  if (undatedTask.error) throw undatedTask.error;
  const undatedActualIncrease = await ownerA.client
    .from('tasks')
    .update({ actual_duration_minutes: 10 })
    .eq('id', undatedTask.data.id)
    .select('actual_duration_minutes')
    .single();
  checkDatabaseError(
    undatedActualIncrease,
    '22023',
    'TASK_ACTUAL_DATE_REQUIRED',
    'Task actual time increased without a business date',
  );
  const undatedState = await ownerA.client
    .from('tasks')
    .select('actual_duration_minutes')
    .eq('id', undatedTask.data.id)
    .single();
  if (undatedState.error) throw undatedState.error;
  const undatedEntries = await ownerA.client
    .from('task_time_entries')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', undatedTask.data.id);
  if (undatedEntries.error) throw undatedEntries.error;
  check(
    undatedState.data.actual_duration_minutes === 0 && undatedEntries.count === 0,
    'Rejected undated actual increase changed the task or created a ledger row.',
  );

  const legacyUnattributed = await ownerA.client
    .from('tasks')
    .insert({
      project_id: projectA.id,
      title: 'Legacy unattributed actual probe',
      scheduled_date: '2026-09-03',
      actual_duration_minutes: 100,
      completed: false,
      status: 'active',
    })
    .select('id')
    .single();
  if (legacyUnattributed.error) throw legacyUnattributed.error;
  const removeLegacyLedger = await admin
    .from('task_time_entries')
    .delete()
    .eq('task_id', legacyUnattributed.data.id);
  if (removeLegacyLedger.error) throw removeLegacyLedger.error;
  const clearLegacyDate = await admin
    .from('tasks')
    .update({ scheduled_date: null })
    .eq('id', legacyUnattributed.data.id);
  if (clearLegacyDate.error) throw clearLegacyDate.error;
  const scheduleLegacyTask = await ownerA.client
    .from('tasks')
    .update({ scheduled_date: '2026-09-03' })
    .eq('id', legacyUnattributed.data.id);
  if (scheduleLegacyTask.error) throw scheduleLegacyTask.error;
  const reduceLegacyUnknown = await ownerA.client
    .from('tasks')
    .update({ actual_duration_minutes: 90 })
    .eq('id', legacyUnattributed.data.id)
    .select('actual_duration_minutes')
    .single();
  checkDatabaseError(
    reduceLegacyUnknown,
    '22023',
    'TASK_ACTUAL_BELOW_FIXED_HISTORY',
    'Legacy unattributed actual was materialized into the newly scheduled date',
  );
  const preservedLegacyUnknown = await ownerA.client
    .from('tasks')
    .select('actual_duration_minutes')
    .eq('id', legacyUnattributed.data.id)
    .single();
  if (preservedLegacyUnknown.error) throw preservedLegacyUnknown.error;
  const legacyLedger = await ownerA.client
    .from('task_time_entries')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', legacyUnattributed.data.id);
  if (legacyLedger.error) throw legacyLedger.error;
  check(
    preservedLegacyUnknown.data.actual_duration_minutes === 100 &&
      legacyLedger.count === 0,
    'Rejected legacy correction changed its aggregate or invented a dated ledger row.',
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

  const concurrentRuntime = await ownerA.client
    .from('daily_entry_items')
    .update({ completed: true, actual_duration_minutes: 30 })
    .eq('id', currentEntryItem.data.id);
  if (concurrentRuntime.error) throw concurrentRuntime.error;
  const concurrentEntryItemId = crypto.randomUUID();
  const concurrentChild = await ownerA.client.from('daily_entry_items').insert({
    id: concurrentEntryItemId,
    entry_id: currentEntry.id,
    template_item_id: null,
    title_snapshot: 'Concurrent entry-only child',
    position: 1,
    completed: true,
    actual_duration_minutes: 12,
  });
  if (concurrentChild.error) throw concurrentChild.error;

  const templateUpdate = await ownerA.client.rpc('update_daily_template_bundle', {
    p_template_id: template.data.id,
    p_entry_id: currentEntry.id,
    p_project_id: alternateProjectA.id,
    p_title: 'Updated Daily template',
    p_template_items: [
      { id: templateItem.data.id, title: 'Updated child', position: 0 },
    ],
    p_entry_items: currentEntryItems.map((item) => ({
      ...item,
      title: 'Updated child',
    })),
  });
  if (templateUpdate.error) throw templateUpdate.error;
  const currentSnapshot = await ownerA.client
    .from('daily_entries')
    .select('project_id, project_name_snapshot, color_snapshot, title_snapshot')
    .eq('id', currentEntry.id)
    .single();
  if (currentSnapshot.error) throw currentSnapshot.error;
  check(
    currentSnapshot.data.project_id === alternateProjectA.id &&
      currentSnapshot.data.project_name_snapshot === alternateProjectA.name &&
      currentSnapshot.data.color_snapshot === alternateProjectA.color &&
      currentSnapshot.data.title_snapshot === 'Updated Daily template',
    'Atomic Daily edit did not synchronize the current entry project name/color snapshots.',
  );
  const mergedEntryItems = await ownerA.client
    .from('daily_entry_items')
    .select('id, template_item_id, completed, actual_duration_minutes')
    .eq('entry_id', currentEntry.id)
    .order('position');
  if (mergedEntryItems.error) throw mergedEntryItems.error;
  check(
    stableRecord(
      Object.fromEntries(
        mergedEntryItems.data.map((item) => [
          item.id,
          {
            templateItemId: item.template_item_id,
            completed: item.completed,
            actual: item.actual_duration_minutes,
          },
        ]),
      ),
    ) ===
      stableRecord({
        [currentEntryItem.data.id]: {
          templateItemId: templateItem.data.id,
          completed: true,
          actual: 30,
        },
        [concurrentEntryItemId]: {
          templateItemId: concurrentEntryItemId,
          completed: true,
          actual: 12,
        },
      }),
    'Stale template payload overwrote concurrent child runtime or dropped the entry-only child.',
  );
  const concurrentTemplateItem = await ownerA.client
    .from('daily_template_items')
    .select('id, title')
    .eq('id', concurrentEntryItemId)
    .single();
  if (concurrentTemplateItem.error) throw concurrentTemplateItem.error;
  check(
    concurrentTemplateItem.data.title === 'Concurrent entry-only child',
    'Concurrent entry-only child did not receive a stable template identity.',
  );
  const retryTemplateUpdate = await ownerA.client.rpc('update_daily_template_bundle', {
    p_template_id: template.data.id,
    p_entry_id: currentEntry.id,
    p_project_id: alternateProjectA.id,
    p_title: 'Updated Daily template',
    p_template_items: [
      { id: templateItem.data.id, title: 'Updated child', position: 0 },
    ],
    p_entry_items: currentEntryItems.map((item) => ({
      ...item,
      title: 'Updated child',
    })),
  });
  if (retryTemplateUpdate.error) throw retryTemplateUpdate.error;
  const stableMergedItems = await ownerA.client
    .from('daily_entry_items')
    .select('id', { count: 'exact', head: true })
    .eq('entry_id', currentEntry.id);
  if (stableMergedItems.error) throw stableMergedItems.error;
  const stableTemplateMapping = await ownerA.client
    .from('daily_template_items')
    .select('id', { count: 'exact', head: true })
    .eq('id', concurrentEntryItemId);
  if (stableTemplateMapping.error) throw stableTemplateMapping.error;
  check(
    stableMergedItems.count === 2 && stableTemplateMapping.count === 1,
    'Retrying a stale Daily template payload duplicated or churned the stable child identity.',
  );
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
        { entry_date: '2026-08-30', title_snapshot: 'Updated Daily template' },
        { entry_date: '2026-08-31', title_snapshot: 'Updated Daily template' },
      ]),
    'Daily template edit did not update the current entry and future materialization together.',
  );

  const expectedCloseMinutes = await readExpectedProjectMinutes(
    ownerA.client,
    '2026-08-30',
  );
  const forgedClose = await ownerA.client.rpc('close_day', {
    p_close_date: '2026-08-30',
    p_actions: [],
    p_project_minutes: { 'forged-project': 999999 },
  });
  if (forgedClose.error) throw forgedClose.error;
  check(
    stableRecord(forgedClose.data.project_minutes) ===
      stableRecord(expectedCloseMinutes),
    'Close day persisted client-supplied project totals instead of server-derived task and Daily minutes.',
  );
  const forgedCloseUpdate = await ownerA.client
    .from('daily_close_records')
    .update({ project_minutes: { 'forged-update': 888888 } })
    .eq('close_date', '2026-08-30')
    .select('project_minutes')
    .single();
  if (forgedCloseUpdate.error) throw forgedCloseUpdate.error;
  check(
    stableRecord(forgedCloseUpdate.data.project_minutes) ===
      stableRecord(expectedCloseMinutes),
    'Direct close-record UPDATE bypassed the server-derived project total.',
  );
  const forgedEmptyClose = await ownerA.client
    .from('daily_close_records')
    .insert({
      close_date: '2099-01-01',
      project_minutes: { 'forged-empty-day': 1 },
    })
    .select('project_minutes')
    .single();
  if (forgedEmptyClose.error) throw forgedEmptyClose.error;
  check(
    stableRecord(forgedEmptyClose.data.project_minutes) === '{}',
    'A close date without task or Daily work did not store an empty server-derived total.',
  );
} finally {
  let cleanupError;
  for (const [client, channel] of channels) {
    const removed = await client.removeChannel(channel);
    if (removed === 'error' && !cleanupError)
      cleanupError = new Error('Realtime channel cleanup failed.');
  }
  for (const user of users) {
    await user.client.auth.signOut();
    user.client.realtime.disconnect();
    const deleted = await admin.auth.admin.deleteUser(user.id);
    if (deleted.error && !cleanupError)
      cleanupError = new Error(
        `Deleting integration account ${user.id} failed: ${deleted.error.message}`,
      );
  }
  admin.realtime.disconnect();
  if (cleanupError) throw cleanupError;
}

console.log('Local Supabase Auth/privileges/RLS/Realtime/Daily integration passed.');
