/** @fileoverview 用本地 Supabase 验证 Auth/RLS/Realtime、任务账本、项目软删除与独立 Daily 的真实写入边界。 */

import { testIssue49Commands } from './test-issue49-integration.mjs';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

/** 在集成检查失败时保留最接近业务语义的错误信息。 */
function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** 验证数据库返回稳定的 SQLSTATE 和业务错误标识。 */
function checkDatabaseError(response, code, marker, context) {
  check(
    response.error?.code === code && response.error.message?.includes(marker),
    `${context}: expected ${code}/${marker}, received ${response.error?.code ?? 'no-code'}/${response.error?.message ?? 'no-error'}.`,
  );
}

/** 读取本地 Supabase 连接信息，不输出测试 secret。 */
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

/** 等待单个预期 Realtime 事件，避免未收到事件时静默通过。 */
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
  const anonymousCreator = await anonymous.rpc('create_daily_template_with_entry', {
    p_template_id: crypto.randomUUID(),
    p_title: 'Denied',
    p_items: [],
    p_entry_date: '2026-09-01',
  });
  check(
    anonymousCreator.error?.code === '42501',
    'Anon must not receive Daily create RPC EXECUTE privileges.',
  );
  anonymous.realtime.disconnect();

  const ownerA = await createSignedInUser(
    admin,
    status,
    `threadline-a-${suffix}@example.test`,
    password,
  );
  const ownerB = await createSignedInUser(
    admin,
    status,
    `threadline-b-${suffix}@example.test`,
    password,
  );
  users.push(ownerA, ownerB);
  for (const owner of users) {
    const initialized = await owner.client.rpc('initialize_workspace');
    if (initialized.error) throw initialized.error;
    check(initialized.data.length === 5, 'Each account must receive five projects.');
  }

  const projectsA = await ownerA.client.from('projects').select('*').order('position');
  if (projectsA.error) throw projectsA.error;
  const fallback = projectsA.data.find((project) => project.is_fallback);
  const projectA = projectsA.data.find((project) => !project.is_fallback);
  check(
    fallback && projectA,
    'Workspace must contain a fallback and a normal project.',
  );
  const projectsB = await ownerB.client
    .from('projects')
    .select('id', { count: 'exact', head: true });
  if (projectsB.error) throw projectsB.error;
  check(projectsB.count === 5, 'RLS leaked owner A projects to owner B.');

  const crossAccountWrite = await ownerB.client
    .from('projects')
    .update({ name: 'Cross-account write must not happen' })
    .eq('id', projectA.id)
    .select('id');
  if (crossAccountWrite.error) throw crossAccountWrite.error;
  check(
    crossAccountWrite.data.length === 0,
    'RLS allowed account B to update account A project.',
  );

  let resolveOwnerRealtimeEvent;
  let foreignRealtimeEvents = 0;
  const ownerRealtimeEvent = waitForEvent((resolve) => {
    resolveOwnerRealtimeEvent = resolve;
  }, 'owner-scoped project update');
  const ownerChannel = ownerA.client.channel(`integration-owner-${suffix}`).on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'projects',
      filter: `owner_id=eq.${ownerA.id}`,
    },
    () => resolveOwnerRealtimeEvent(),
  );
  const foreignChannel = ownerB.client.channel(`integration-foreign-${suffix}`).on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'projects',
      filter: `owner_id=eq.${ownerB.id}`,
    },
    () => {
      foreignRealtimeEvents += 1;
    },
  );
  channels.push([ownerA.client, ownerChannel], [ownerB.client, foreignChannel]);
  await Promise.all([
    subscribe(ownerChannel, 'Owner A'),
    subscribe(foreignChannel, 'Owner B'),
  ]);
  // Realtime 在 db reset 后可能先报告订阅成功、再完成 CDC 初始化。
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  const realtimeUpdate = await ownerA.client
    .from('projects')
    .update({ name: 'Realtime owner scope verified' })
    .eq('id', projectA.id)
    .select('id')
    .single();
  if (realtimeUpdate.error) throw realtimeUpdate.error;
  await ownerRealtimeEvent;
  await new Promise((resolve) => setTimeout(resolve, 500));
  check(foreignRealtimeEvents === 0, 'Account B received an owner A Realtime event.');

  const rhythm = await ownerA.client
    .from('rhythm_marks')
    .insert({ mark_date: '2026-09-01', marked: true })
    .select('id')
    .single();
  if (rhythm.error) throw rhythm.error;
  const foreignRhythm = await ownerB.client
    .from('rhythm_marks')
    .select('id', { count: 'exact', head: true });
  if (foreignRhythm.error) throw foreignRhythm.error;
  check(foreignRhythm.count === 0, 'RLS leaked owner A Rhythm rows to owner B.');

  const templateId = crypto.randomUUID();
  const templateItemId = crypto.randomUUID();
  const createdTemplate = await ownerA.client.rpc('create_daily_template_with_entry', {
    p_template_id: templateId,
    p_title: '独立 Daily',
    p_items: [
      {
        id: templateItemId,
        title: '计划清单',
        position: 0,
        planned_duration_minutes: 35,
      },
    ],
    p_entry_date: '2026-09-01',
  });
  if (createdTemplate.error) throw createdTemplate.error;
  const createdEntry = await ownerA.client
    .from('daily_entries')
    .select('id, project_id, title_snapshot')
    .eq('template_id', templateId)
    .eq('entry_date', '2026-09-01')
    .single();
  if (createdEntry.error) throw createdEntry.error;
  const createdEntryItem = await ownerA.client
    .from('daily_entry_items')
    .select('id, template_item_id, planned_duration_minutes_snapshot')
    .eq('entry_id', createdEntry.data.id)
    .single();
  if (createdEntryItem.error) throw createdEntryItem.error;
  check(
    createdEntry.data.project_id === null &&
      createdEntryItem.data.template_item_id === templateItemId &&
      createdEntryItem.data.planned_duration_minutes_snapshot === 35,
    'Atomic Daily creation wrote a project binding or lost the planned-duration snapshot.',
  );

  const foreignTemplateId = crypto.randomUUID();
  const foreignItemId = crypto.randomUUID();
  const foreignTemplate = await ownerA.client.rpc('create_daily_template_with_entry', {
    p_template_id: foreignTemplateId,
    p_title: 'Other Daily',
    p_items: [
      {
        id: foreignItemId,
        title: 'Other item',
        position: 0,
        planned_duration_minutes: 5,
      },
    ],
    p_entry_date: '2026-09-01',
  });
  if (foreignTemplate.error) throw foreignTemplate.error;
  const foreignTemplateDirectWrite = await ownerB.client
    .from('daily_templates')
    .update({ title: 'Cross-owner direct template mutation' })
    .eq('id', templateId)
    .select('id');
  checkDatabaseError(
    foreignTemplateDirectWrite,
    '42501',
    'permission denied',
    'Authenticated client directly mutated another owner Daily template',
  );
  const foreignItemDirectWrite = await ownerB.client
    .from('daily_template_items')
    .update({ title: 'Cross-owner direct item mutation' })
    .eq('id', templateItemId)
    .select('id');
  checkDatabaseError(
    foreignItemDirectWrite,
    '42501',
    'permission denied',
    'Authenticated client directly mutated another owner Daily item',
  );
  const scopeMismatch = await ownerA.client.rpc('update_daily_template_bundle', {
    p_template_id: templateId,
    p_title: 'Should roll back',
    p_items: [
      {
        id: foreignItemId,
        title: 'Foreign item',
        position: 0,
        planned_duration_minutes: 5,
      },
    ],
  });
  checkDatabaseError(
    scopeMismatch,
    '22023',
    'DAILY_TEMPLATE_ITEM_SCOPE_MISMATCH',
    'Daily template accepted an item from another template',
  );
  const rolledBackTemplate = await ownerA.client
    .from('daily_templates')
    .select('title')
    .eq('id', templateId)
    .single();
  if (rolledBackTemplate.error) throw rolledBackTemplate.error;
  check(
    rolledBackTemplate.data.title === '独立 Daily',
    'Rejected Daily item scope mismatch partially committed the template title.',
  );

  const savedEntry = await ownerA.client.rpc('save_daily_entry_bundle', {
    p_entry_id: createdEntry.data.id,
    p_title: '独立 Daily',
    p_completed: true,
    p_actual_duration_minutes: 12,
    p_result: '完成',
    p_items: [
      {
        id: createdEntryItem.data.id,
        title: '计划清单',
        completed: true,
        actual: 23,
      },
    ],
  });
  if (savedEntry.error) throw savedEntry.error;
  const dailyOnlyClose = await ownerA.client.rpc('close_day', {
    p_close_date: '2026-09-01',
    p_actions: [],
    p_project_minutes: { forged: 999 },
  });
  if (dailyOnlyClose.error) throw dailyOnlyClose.error;
  check(
    JSON.stringify(dailyOnlyClose.data.project_minutes) === '{}',
    'Daily actual leaked into the project-scoped close-day aggregate.',
  );
  const futureTemplateItemId = crypto.randomUUID();
  const updatedTemplate = await ownerA.client.rpc('update_daily_template_bundle', {
    p_template_id: templateId,
    p_title: '更新后的 Daily',
    p_items: [
      {
        id: templateItemId,
        title: '更新后的计划清单',
        position: 0,
        planned_duration_minutes: 50,
      },
      {
        id: futureTemplateItemId,
        title: '未来日期新增清单',
        position: 1,
        planned_duration_minutes: 15,
      },
    ],
  });
  if (updatedTemplate.error) throw updatedTemplate.error;
  const frozenEntry = await ownerA.client
    .from('daily_entries')
    .select('title_snapshot, completed, actual_duration_minutes, result')
    .eq('id', createdEntry.data.id)
    .single();
  if (frozenEntry.error) throw frozenEntry.error;
  const frozenItem = await ownerA.client
    .from('daily_entry_items')
    .select(
      'title_snapshot, planned_duration_minutes_snapshot, completed, actual_duration_minutes',
    )
    .eq('id', createdEntryItem.data.id)
    .single();
  if (frozenItem.error) throw frozenItem.error;
  check(
    frozenEntry.data.title_snapshot === '独立 Daily' &&
      frozenEntry.data.completed &&
      frozenEntry.data.actual_duration_minutes === 12 &&
      frozenItem.data.title_snapshot === '计划清单' &&
      frozenItem.data.planned_duration_minutes_snapshot === 35 &&
      frozenItem.data.actual_duration_minutes === 23,
    'Template edit rewrote an existing Daily entry snapshot.',
  );
  const repeatedCurrentDate = await ownerA.client.rpc('ensure_daily_entries_for_date', {
    p_entry_date: '2026-09-01',
  });
  if (repeatedCurrentDate.error) throw repeatedCurrentDate.error;
  const currentDateItemsAfterTemplateAppend = await ownerA.client
    .from('daily_entry_items')
    .select('template_item_id, title_snapshot, planned_duration_minutes_snapshot')
    .eq('entry_id', createdEntry.data.id);
  if (currentDateItemsAfterTemplateAppend.error)
    throw currentDateItemsAfterTemplateAppend.error;
  check(
    currentDateItemsAfterTemplateAppend.data.length === 1 &&
      currentDateItemsAfterTemplateAppend.data[0].template_item_id === templateItemId &&
      currentDateItemsAfterTemplateAppend.data[0].planned_duration_minutes_snapshot ===
        35,
    'Repeated materialization appended a new template item to an existing Daily entry snapshot.',
  );
  const materializedFuture = await ownerA.client.rpc('ensure_daily_entries_for_date', {
    p_entry_date: '2026-09-02',
  });
  if (materializedFuture.error) throw materializedFuture.error;
  const futureEntry = await ownerA.client
    .from('daily_entries')
    .select('id, title_snapshot, project_id')
    .eq('template_id', templateId)
    .eq('entry_date', '2026-09-02')
    .single();
  if (futureEntry.error) throw futureEntry.error;
  const futureItems = await ownerA.client
    .from('daily_entry_items')
    .select('template_item_id, title_snapshot, planned_duration_minutes_snapshot')
    .eq('entry_id', futureEntry.data.id)
    .order('position');
  if (futureItems.error) throw futureItems.error;
  check(
    futureEntry.data.title_snapshot === '更新后的 Daily' &&
      futureEntry.data.project_id === null &&
      futureItems.data.length === 2 &&
      futureItems.data[0].template_item_id === templateItemId &&
      futureItems.data[0].title_snapshot === '更新后的计划清单' &&
      futureItems.data[0].planned_duration_minutes_snapshot === 50 &&
      futureItems.data[1].template_item_id === futureTemplateItemId &&
      futureItems.data[1].title_snapshot === '未来日期新增清单' &&
      futureItems.data[1].planned_duration_minutes_snapshot === 15,
    'Future Daily materialization did not use the independently updated template structure.',
  );
  const concurrentMaterialization = await Promise.all([
    ownerA.client.rpc('ensure_daily_entries_for_date', { p_entry_date: '2026-09-05' }),
    ownerA.client.rpc('ensure_daily_entries_for_date', { p_entry_date: '2026-09-05' }),
  ]);
  for (const response of concurrentMaterialization)
    if (response.error) throw response.error;
  const concurrentEntries = await ownerA.client
    .from('daily_entries')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId)
    .eq('entry_date', '2026-09-05');
  if (concurrentEntries.error) throw concurrentEntries.error;
  check(
    concurrentEntries.count === 1,
    'Concurrent Daily materialization created duplicate entries.',
  );

  const archived = await ownerA.client.rpc('set_daily_template_status', {
    p_template_id: templateId,
    p_status: 'archive',
  });
  if (archived.error) throw archived.error;
  const archivedDirectAppend = await ownerA.client
    .from('daily_template_items')
    .insert({
      id: crypto.randomUUID(),
      template_id: templateId,
      title: 'Direct archived append must fail',
      position: 2,
      planned_duration_minutes: 10,
    })
    .select('id');
  checkDatabaseError(
    archivedDirectAppend,
    '42501',
    'permission denied',
    'Archived Daily accepted a direct table checklist append',
  );
  const archivedTemplateEdit = await ownerA.client.rpc('update_daily_template_bundle', {
    p_template_id: templateId,
    p_title: '归档后仍可修改的 Daily',
    p_items: [
      {
        id: templateItemId,
        title: '归档后仍可修改的清单',
        position: 0,
        planned_duration_minutes: 50,
      },
    ],
  });
  if (archivedTemplateEdit.error) throw archivedTemplateEdit.error;
  check(
    archivedTemplateEdit.data.title === '归档后仍可修改的 Daily',
    'Archived Daily template could not save an allowed edit.',
  );
  const archivedAppend = await ownerA.client.rpc('update_daily_template_bundle', {
    p_template_id: templateId,
    p_title: '归档后不能追加清单',
    p_items: [
      {
        id: templateItemId,
        title: '归档后仍可修改的清单',
        position: 0,
        planned_duration_minutes: 50,
      },
      {
        id: crypto.randomUUID(),
        title: '不应追加的清单',
        position: 1,
        planned_duration_minutes: 10,
      },
    ],
  });
  checkDatabaseError(
    archivedAppend,
    '22023',
    'ARCHIVED_DAILY_ITEM_APPEND_FORBIDDEN',
    'Archived Daily template accepted a newly appended checklist item',
  );
  const afterArchivedAppend = await ownerA.client
    .from('daily_templates')
    .select('title')
    .eq('id', templateId)
    .single();
  if (afterArchivedAppend.error) throw afterArchivedAppend.error;
  check(
    afterArchivedAppend.data.title === '归档后仍可修改的 Daily',
    'Rejected archived Daily append partially committed a template title change.',
  );
  const afterArchive = await ownerA.client.rpc('ensure_daily_entries_for_date', {
    p_entry_date: '2026-09-03',
  });
  if (afterArchive.error) throw afterArchive.error;
  const archivedFuture = await ownerA.client
    .from('daily_entries')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId)
    .eq('entry_date', '2026-09-03');
  if (archivedFuture.error) throw archivedFuture.error;
  check(
    archivedFuture.count === 0,
    'Archived Daily template still materialized a future entry.',
  );
  const restored = await ownerA.client.rpc('set_daily_template_status', {
    p_template_id: templateId,
    p_status: 'restore',
  });
  if (restored.error) throw restored.error;
  const archivedItem = await ownerA.client.rpc('set_daily_template_item_status', {
    p_template_item_id: templateItemId,
    p_status: 'archive',
  });
  if (archivedItem.error) throw archivedItem.error;
  const materializedWithoutItem = await ownerA.client.rpc(
    'ensure_daily_entries_for_date',
    { p_entry_date: '2026-09-04' },
  );
  if (materializedWithoutItem.error) throw materializedWithoutItem.error;
  const entryWithoutItem = await ownerA.client
    .from('daily_entries')
    .select('id')
    .eq('template_id', templateId)
    .eq('entry_date', '2026-09-04')
    .single();
  if (entryWithoutItem.error) throw entryWithoutItem.error;
  const missingFutureItem = await ownerA.client
    .from('daily_entry_items')
    .select('id', { count: 'exact', head: true })
    .eq('entry_id', entryWithoutItem.data.id);
  if (missingFutureItem.error) throw missingFutureItem.error;
  check(
    missingFutureItem.count === 0,
    'Archived Daily item still materialized into a future entry.',
  );
  const restoredItem = await ownerA.client.rpc('set_daily_template_item_status', {
    p_template_item_id: templateItemId,
    p_status: 'restore',
  });
  if (restoredItem.error) throw restoredItem.error;
  const deletedItem = await ownerA.client.rpc('set_daily_template_item_status', {
    p_template_item_id: templateItemId,
    p_status: 'delete',
  });
  if (deletedItem.error) throw deletedItem.error;
  const staleItemRestore = await ownerA.client.rpc('set_daily_template_item_status', {
    p_template_item_id: templateItemId,
    p_status: 'restore',
  });
  checkDatabaseError(
    staleItemRestore,
    'P0002',
    'DAILY_TEMPLATE_ITEM_NOT_FOUND',
    'Deleted Daily item could be restored by a stale client request',
  );
  const directDeletedItemRestore = await ownerA.client
    .from('daily_template_items')
    .update({ deleted_at: null, is_active: true })
    .eq('id', templateItemId)
    .select('id');
  checkDatabaseError(
    directDeletedItemRestore,
    '42501',
    'permission denied',
    'Deleted Daily item could be restored through a direct table update',
  );
  const staleDeletedItemSave = await ownerA.client.rpc('update_daily_template_bundle', {
    p_template_id: templateId,
    p_title: 'Deleted item must stay deleted',
    p_items: [
      {
        id: templateItemId,
        title: 'Stale item edit',
        position: 0,
        planned_duration_minutes: 50,
      },
    ],
  });
  checkDatabaseError(
    staleDeletedItemSave,
    '22023',
    'DELETED_DAILY_TEMPLATE_ITEM_UPDATE_FORBIDDEN',
    'Deleted Daily item accepted a stale template update',
  );
  const deletedTemplate = await ownerA.client.rpc('set_daily_template_status', {
    p_template_id: templateId,
    p_status: 'delete',
  });
  if (deletedTemplate.error) throw deletedTemplate.error;
  const staleTemplateRestore = await ownerA.client.rpc('set_daily_template_status', {
    p_template_id: templateId,
    p_status: 'restore',
  });
  checkDatabaseError(
    staleTemplateRestore,
    'P0002',
    'DAILY_TEMPLATE_NOT_FOUND',
    'Deleted Daily template could be restored by a stale client request',
  );
  const directDeletedTemplateRestore = await ownerA.client
    .from('daily_templates')
    .update({ deleted_at: null, is_active: true })
    .eq('id', templateId)
    .select('id');
  checkDatabaseError(
    directDeletedTemplateRestore,
    '42501',
    'permission denied',
    'Deleted Daily template could be restored through a direct table update',
  );
  const staleTemplateSave = await ownerA.client.rpc('update_daily_template_bundle', {
    p_template_id: templateId,
    p_title: 'Deleted Daily must stay deleted',
    p_items: [],
  });
  checkDatabaseError(
    staleTemplateSave,
    'P0002',
    'DAILY_TEMPLATE_NOT_FOUND',
    'Deleted Daily template accepted a stale update',
  );

  const ledgerTask = await ownerA.client
    .from('tasks')
    .insert({
      project_id: projectA.id,
      title: 'Date-bound actual ledger probe',
      scheduled_date: '2026-09-05',
      actual_duration_minutes: 40,
      completed: false,
      status: 'active',
    })
    .select('id')
    .single();
  if (ledgerTask.error) throw ledgerTask.error;
  const rescheduledLedgerTask = await ownerA.client
    .from('tasks')
    .update({ scheduled_date: '2026-09-06', actual_duration_minutes: 120 })
    .eq('id', ledgerTask.data.id)
    .select('id')
    .single();
  if (rescheduledLedgerTask.error) throw rescheduledLedgerTask.error;
  const ledgerRows = await ownerA.client
    .from('task_time_entries')
    .select('id, entry_date, minutes')
    .eq('task_id', ledgerTask.data.id)
    .order('entry_date');
  if (ledgerRows.error) throw ledgerRows.error;
  check(
    JSON.stringify(
      ledgerRows.data.map(({ entry_date, minutes }) => ({ entry_date, minutes })),
    ) ===
      JSON.stringify([
        { entry_date: '2026-09-05', minutes: 40 },
        { entry_date: '2026-09-06', minutes: 80 },
      ]),
    'Task actual ledger drifted when a dated task was rescheduled.',
  );
  const reducedLedgerTask = await ownerA.client
    .from('tasks')
    .update({ actual_duration_minutes: 100 })
    .eq('id', ledgerTask.data.id)
    .select('actual_duration_minutes')
    .single();
  if (reducedLedgerTask.error) throw reducedLedgerTask.error;
  const reducedLedgerRows = await ownerA.client
    .from('task_time_entries')
    .select('id, entry_date, minutes')
    .eq('task_id', ledgerTask.data.id)
    .order('entry_date');
  if (reducedLedgerRows.error) throw reducedLedgerRows.error;
  check(
    reducedLedgerTask.data.actual_duration_minutes === 100 &&
      JSON.stringify(
        reducedLedgerRows.data.map(({ entry_date, minutes }) => ({
          entry_date,
          minutes,
        })),
      ) ===
        JSON.stringify([
          { entry_date: '2026-09-05', minutes: 40 },
          { entry_date: '2026-09-06', minutes: 60 },
        ]),
    'Task actual reduction did not preserve fixed historical minutes.',
  );
  const belowLedgerBoundary = await ownerA.client
    .from('tasks')
    .update({ actual_duration_minutes: 20 })
    .eq('id', ledgerTask.data.id);
  checkDatabaseError(
    belowLedgerBoundary,
    '22023',
    'TASK_ACTUAL_BELOW_FIXED_HISTORY',
    'Task actual reduction crossed immutable dated history',
  );
  const directTimeInsert = await ownerA.client.from('task_time_entries').insert({
    owner_id: ownerA.id,
    task_id: ledgerTask.data.id,
    entry_date: '2026-09-07',
    project_id: projectA.id,
    minutes: 5,
  });
  const directTimeUpdate = await ownerA.client
    .from('task_time_entries')
    .update({ minutes: 999 })
    .eq('id', reducedLedgerRows.data[0].id);
  const directTimeDelete = await ownerA.client
    .from('task_time_entries')
    .delete()
    .eq('id', reducedLedgerRows.data[0].id);
  check(
    directTimeInsert.error?.code === '42501' &&
      directTimeUpdate.error?.code === '42501' &&
      directTimeDelete.error?.code === '42501',
    'Authenticated client received task_time_entries write privileges.',
  );
  const undatedTask = await ownerA.client
    .from('tasks')
    .insert({
      project_id: projectA.id,
      title: 'Undated actual rejection probe',
      scheduled_date: null,
      actual_duration_minutes: 0,
      completed: false,
      status: 'waiting',
    })
    .select('id')
    .single();
  if (undatedTask.error) throw undatedTask.error;
  const undatedActual = await ownerA.client
    .from('tasks')
    .update({ actual_duration_minutes: 10 })
    .eq('id', undatedTask.data.id);
  checkDatabaseError(
    undatedActual,
    '22023',
    'TASK_ACTUAL_DATE_REQUIRED',
    'Undated task accepted actual minutes',
  );
  const completedTask = await ownerA.client
    .from('tasks')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq('id', ledgerTask.data.id);
  if (completedTask.error) throw completedTask.error;
  const reopenedTask = await ownerA.client
    .from('tasks')
    .update({ completed: false, completed_at: null })
    .eq('id', ledgerTask.data.id);
  if (reopenedTask.error) throw reopenedTask.error;
  const completionHistory = await ownerA.client
    .from('history_events')
    .select('event_type')
    .eq('task_id', ledgerTask.data.id)
    .in('event_type', ['completed', 'reopened'])
    .order('occurred_at');
  if (completionHistory.error) throw completionHistory.error;
  check(
    JSON.stringify(completionHistory.data) ===
      JSON.stringify([{ event_type: 'completed' }, { event_type: 'reopened' }]),
    'Task completion and reopen transitions lost formal history.',
  );
  const forgedTaskClose = await ownerA.client.rpc('close_day', {
    p_close_date: '2026-09-05',
    p_actions: [],
    p_project_minutes: { forged: 999999 },
  });
  if (forgedTaskClose.error) throw forgedTaskClose.error;
  check(
    forgedTaskClose.data.project_minutes[projectA.id] === 40 &&
      !Object.hasOwn(forgedTaskClose.data.project_minutes, 'forged'),
    'Close day did not derive project minutes from task ledger server-side.',
  );

  const trackedTask = await ownerA.client
    .from('tasks')
    .insert({
      project_id: projectA.id,
      title: 'Project delete migration probe',
      scheduled_date: '2026-09-01',
      actual_duration_minutes: 40,
      completed: false,
      status: 'active',
    })
    .select('id')
    .single();
  if (trackedTask.error) throw trackedTask.error;
  const hiddenTasksForOwnerB = await ownerB.client
    .from('tasks')
    .select('id', { count: 'exact', head: true });
  if (hiddenTasksForOwnerB.error) throw hiddenTasksForOwnerB.error;
  check(hiddenTasksForOwnerB.count === 0, 'RLS leaked owner A task to owner B.');
  const taskLedger = await ownerA.client
    .from('task_time_entries')
    .select('project_id, minutes')
    .eq('task_id', trackedTask.data.id)
    .single();
  if (taskLedger.error) throw taskLedger.error;
  const deletedProject = await ownerA.client.rpc('soft_delete_project', {
    p_project_id: projectA.id,
  });
  if (deletedProject.error) throw deletedProject.error;
  const movedTask = await ownerA.client
    .from('tasks')
    .select('project_id')
    .eq('id', trackedTask.data.id)
    .single();
  if (movedTask.error) throw movedTask.error;
  const preservedLedger = await ownerA.client
    .from('task_time_entries')
    .select('project_id, minutes')
    .eq('task_id', trackedTask.data.id)
    .single();
  if (preservedLedger.error) throw preservedLedger.error;
  const deletedProjectState = await ownerA.client
    .from('projects')
    .select('deleted_at')
    .eq('id', projectA.id)
    .single();
  if (deletedProjectState.error) throw deletedProjectState.error;
  check(
    movedTask.data.project_id === fallback.id &&
      taskLedger.data.project_id === projectA.id &&
      preservedLedger.data.project_id === projectA.id &&
      preservedLedger.data.minutes === 40 &&
      deletedProjectState.data.deleted_at !== null,
    'Project soft delete did not migrate active task while preserving the historical ledger.',
  );
  const fallbackDelete = await ownerA.client.rpc('soft_delete_project', {
    p_project_id: fallback.id,
  });
  checkDatabaseError(
    fallbackDelete,
    '22023',
    'PROJECT_DELETE_FORBIDDEN',
    'Fallback project was deletable',
  );
  await testIssue49Commands(ownerA.client, ownerB.client, fallback.id);
} finally {
  let cleanupError;
  for (const [client, channel] of channels) {
    const removed = await client.removeChannel(channel);
    if (removed === 'error' && !cleanupError)
      cleanupError = new Error('Realtime channel cleanup failed.');
  }
  for (const owner of users) {
    owner.client.realtime.disconnect();
    await owner.client.auth.signOut();
    const deleted = await admin.auth.admin.deleteUser(owner.id);
    if (deleted.error && !cleanupError) cleanupError = deleted.error;
  }
  admin.realtime.disconnect();
  if (cleanupError) throw cleanupError;
}

console.log(
  'Local Supabase Auth/RLS/Realtime/task-ledger/project-delete/Daily integration passed.',
);
