/** @fileoverview 用本地 Supabase 验证 Auth/RLS、项目软删除与独立 Daily 模板的真实写入边界。 */

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
  return { id: created.data.user.id, client };
}

const status = readLocalStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Threadline-${suffix}-Aa1!`;
const users = [];

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
  const futureItem = await ownerA.client
    .from('daily_entry_items')
    .select('title_snapshot, planned_duration_minutes_snapshot')
    .eq('entry_id', futureEntry.data.id)
    .single();
  if (futureItem.error) throw futureItem.error;
  check(
    futureEntry.data.title_snapshot === '更新后的 Daily' &&
      futureEntry.data.project_id === null &&
      futureItem.data.title_snapshot === '更新后的计划清单' &&
      futureItem.data.planned_duration_minutes_snapshot === 50,
    'Future Daily materialization did not use the independently updated template.',
  );

  const archived = await ownerA.client.rpc('set_daily_template_status', {
    p_template_id: templateId,
    p_status: 'archive',
  });
  if (archived.error) throw archived.error;
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
} finally {
  for (const owner of users) {
    owner.client.realtime.disconnect();
    await owner.client.auth.signOut();
    const deleted = await admin.auth.admin.deleteUser(owner.id);
    if (deleted.error) throw deleted.error;
  }
  admin.realtime.disconnect();
}

console.log('Local Supabase Auth/RLS/project-delete/Daily integration passed.');
