/** @fileoverview 在 Docker 不可用时静态守卫已审核的 Supabase 领域与安全边界。 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const migrationsDirectory = join('supabase', 'migrations');
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort();
if (migrationFiles.length === 0) throw new Error('No Supabase migrations found.');
const migration = (
  await Promise.all(
    migrationFiles.map((name) => readFile(join(migrationsDirectory, name), 'utf8')),
  )
).join('\n');
const dailyManagerMigration = await readFile(
  join(migrationsDirectory, '202609010001_project_daily_manager.sql'),
  'utf8',
);
const waitingTaskMigration = await readFile(
  join(migrationsDirectory, '202609040001_waiting_task_pool.sql'),
  'utf8',
);

/** 要求迁移包含关键片段，错误信息直接指出缺失的审核约束。 */
function requirePattern(pattern, description) {
  if (!pattern.test(migration))
    throw new Error(`Supabase contract missing: ${description}`);
}

/** 禁止迁移重新引入明确排除的模型。 */
function rejectPattern(pattern, description) {
  if (pattern.test(migration))
    throw new Error(`Supabase contract violation: ${description}`);
}

/** 提取具名表的 create 定义，使约束断言不会误命中其他业务表。 */
function readTableDefinition(tableName) {
  const match = migration.match(
    new RegExp(
      `create table(?: if not exists)? public\\.${tableName}\\s*\\(([\\s\\S]*?)\\n\\);`,
      'i',
    ),
  );
  if (!match)
    throw new Error(`Supabase contract missing table definition: ${tableName}`);
  return match[1];
}

/** 提取具名函数的完整定义，使 RPC 内部 scope guard 必须出现在正确函数中。 */
function readFunctionDefinition(functionName) {
  const match = migration.match(
    new RegExp(
      `create or replace function\\s+(?:public|private)\\.${functionName}\\s*\\([\\s\\S]*?\\$\\$;`,
      'i',
    ),
  );
  if (!match)
    throw new Error(`Supabase contract missing function definition: ${functionName}`);
  return match[0];
}

/** 在指定定义内要求关键片段，避免全迁移级正则产生跨对象误报。 */
function requireDefinitionPattern(definition, pattern, description) {
  if (!pattern.test(definition))
    throw new Error(`Supabase contract missing: ${description}`);
}

requirePattern(/create table public\.rhythm_marks/i, 'cloud Rhythm table');
requirePattern(
  /alter table public\.daily_subtask_instances alter column id set default gen_random_uuid\(\)/i,
  'server-generated UUIDs for date-only Daily items',
);
requirePattern(/create table public\.daily_history_entries/i, 'formal Daily history');
requirePattern(
  /'daily_history_entries', 'history_events', 'daily_close_records'/i,
  'append-only history invalidation publication',
);
requirePattern(
  /unique \(owner_id, template_id, entry_date\)/i,
  'Daily identity uniqueness',
);
requirePattern(
  /alter column template_item_id drop not null/i,
  'nullable Daily template item mapping',
);
requirePattern(
  /DAILY_TEMPLATE_ITEM_MISMATCH/i,
  'Daily entry items cannot map across templates',
);
const taskTimeEntriesTable = readTableDefinition('task_time_entries');
requireDefinitionPattern(
  taskTimeEntriesTable,
  /foreign key\s*\(\s*owner_id\s*,\s*task_id\s*\)\s*references\s+public\.tasks\s*\(\s*owner_id\s*,\s*id\s*\)\s*on delete set null\s*\(\s*task_id\s*\)/i,
  'task time entries preserve history with a same-owner task foreign key',
);
requireDefinitionPattern(
  taskTimeEntriesTable,
  /foreign key\s*\(\s*owner_id\s*,\s*project_id\s*\)\s*references\s+public\.projects\s*\(\s*owner_id\s*,\s*id\s*\)\s*on delete no action/i,
  'task time entries protect direct project deletion without blocking whole-account cascades',
);
if (/task_id\s+uuid\s+not\s+null/i.test(taskTimeEntriesTable))
  throw new Error(
    'Supabase contract violation: task time task_id must allow retained rows after task purge',
  );
requirePattern(
  /revoke all(?: privileges)? on(?: table)? public\.task_time_entries from public, anon, authenticated/i,
  'task time direct writes revoked from Data API roles',
);
requirePattern(
  /grant select on(?: table)? public\.task_time_entries to authenticated/i,
  'authenticated task time access is read-only',
);
rejectPattern(
  /grant\s+[^;]*\b(?:insert|update|delete)\b[^;]*\s+on(?: table)? public\.task_time_entries\s+to authenticated/i,
  'authenticated task time access must not permit direct writes',
);
const captureTaskActualTime = readFunctionDefinition('capture_task_actual_time');
requireDefinitionPattern(
  captureTaskActualTime,
  /security definer\s+set search_path = pg_catalog, public/is,
  'task actual capture uses a fixed-path security definer trigger',
);
requireDefinitionPattern(
  captureTaskActualTime,
  /if delta < 0 then[\s\S]*?update public\.task_time_entries[\s\S]*?entry_date\s*=\s*new\.scheduled_date[\s\S]*?entries\.minutes \+ delta >= 0[\s\S]*?if not found then[\s\S]*?TASK_ACTUAL_BELOW_FIXED_HISTORY/i,
  'negative actual corrections only reduce an existing current-date ledger bucket',
);
if (/next_minutes\s*-\s*fixed_minutes/i.test(captureTaskActualTime))
  throw new Error(
    'Supabase contract violation: legacy unattributed actual must not be materialized by a negative correction',
  );
requirePattern(
  /begin;\s*lock table public\.tasks in share row exclusive mode;[\s\S]*?create trigger tasks_capture_actual_time[\s\S]*?execute function public\.capture_task_actual_time\(\);\s*commit;/i,
  'task writes are transactionally locked across ledger backfill and trigger installation',
);
requirePattern(
  /revoke all(?: privileges)? on function (?:public|private)\.capture_task_actual_time\(\) from public, anon, authenticated/i,
  'task actual capture cannot be invoked through Data API roles',
);
requirePattern(
  /alter publication supabase_realtime add table public\.task_time_entries/i,
  'task time entries participate in workspace invalidation',
);
const saveDailyEntryBundle = readFunctionDefinition('save_daily_entry_bundle');
requireDefinitionPattern(
  saveDailyEntryBundle,
  /jsonb_to_recordset[\s\S]*?join public\.daily_entry_items[\s\S]*?entry_id\s*<>\s*p_entry_id[\s\S]*?DAILY_ENTRY_ITEM_SCOPE_MISMATCH/i,
  'Daily entry item IDs are scoped to the target entry before replacement',
);
const updateDailyTemplateBundle = readFunctionDefinition(
  'update_daily_template_bundle',
);
requireDefinitionPattern(
  updateDailyTemplateBundle,
  /jsonb_to_recordset[\s\S]*?join public\.daily_template_items[\s\S]*?template_id\s*<>\s*p_template_id[\s\S]*?DAILY_TEMPLATE_ITEM_SCOPE_MISMATCH/i,
  'Daily template item IDs are scoped to the target template before replacement',
);
requireDefinitionPattern(
  updateDailyTemplateBundle,
  /p_entry_items[\s\S]*?join public\.daily_entry_items[\s\S]*?entry_id\s*<>\s*p_entry_id[\s\S]*?DAILY_ENTRY_ITEM_SCOPE_MISMATCH/i,
  'Daily template edits scope current entry item IDs before replacement',
);
requireDefinitionPattern(
  updateDailyTemplateBundle,
  /DAILY_TEMPLATE_ITEM_SCOPE_MISMATCH[\s\S]*?DAILY_ENTRY_ITEM_SCOPE_MISMATCH[\s\S]*?DAILY_ITEM_MAPPING_MISMATCH/i,
  'Daily template edits reject out-of-scope IDs before validating bundle mappings',
);
requireDefinitionPattern(
  updateDailyTemplateBundle,
  /from public\.daily_templates[\s\S]*?for update[\s\S]*?from public\.daily_entries[\s\S]*?entries\.id\s*=\s*p_entry_id[\s\S]*?entries\.template_id\s*=\s*p_template_id[\s\S]*?for update[\s\S]*?from public\.daily_entry_items[\s\S]*?for update/i,
  'Daily template edits lock the owner-scoped template, current entry, and entry children',
);
requireDefinitionPattern(
  updateDailyTemplateBundle,
  /full join supplied on supplied\.id = existing\.id[\s\S]*?missing_from_payload/i,
  'Daily template edits merge server children that are missing from a stale payload',
);
requireDefinitionPattern(
  updateDailyTemplateBundle,
  /else existing\.completed end as completed[\s\S]*?else existing\.actual_duration_minutes end as actual/i,
  'Daily template edits preserve locked completed and actual runtime fields',
);
requireDefinitionPattern(
  updateDailyTemplateBundle,
  /insert into public\.daily_entry_items\([\s\S]*?on conflict \(id\) do update\s+set template_item_id = excluded\.template_item_id,\s+title_snapshot = excluded\.title_snapshot,\s+position = excluded\.position;[\s\S]*?return saved/i,
  'Daily template entry upsert changes structure without overwriting completed or actual runtime',
);
if (/perform public\.save_daily_entry_bundle\(/i.test(updateDailyTemplateBundle))
  throw new Error(
    'Supabase contract violation: template structure edits must not replay stale entry runtime through the full replacement RPC',
  );
requirePattern(
  /revoke all(?: privileges)? on function public\.update_daily_template_bundle\(uuid, uuid, uuid, text, jsonb, jsonb\) from public, anon, authenticated/i,
  'six-argument Daily template bundle is revoked before its authenticated grant',
);
requirePattern(
  /grant execute on function public\.update_daily_template_bundle\(uuid, uuid, uuid, text, jsonb, jsonb\) to authenticated/i,
  'authenticated can execute the atomic six-argument Daily template bundle',
);
requirePattern(
  /revoke all(?: privileges)? on function public\.daily_entry_total_actual\(uuid\) from public, anon, authenticated/i,
  'Daily total helper is removed from anonymous and default PUBLIC execution',
);
requirePattern(
  /grant execute on function public\.daily_entry_total_actual\(uuid\) to authenticated/i,
  'authenticated can execute the owner-scoped Daily total helper',
);
const captureDailyCloseProjectMinutes = readFunctionDefinition(
  'capture_daily_close_project_minutes',
);
requireDefinitionPattern(
  captureDailyCloseProjectMinutes,
  /security invoker\s+set search_path = pg_catalog, public[\s\S]*?select[\s\S]*?into new\.project_minutes[\s\S]*?task_time_entries[\s\S]*?entry_date\s*=\s*new\.close_date[\s\S]*?daily_entry_total_actual\(entries\.id\)/is,
  'close records recompute project totals from dated task and Daily sources',
);
requirePattern(
  /create trigger daily_close_capture_project_minutes\s+before insert or update on public\.daily_close_records[\s\S]*?execute function public\.capture_daily_close_project_minutes\(\)/i,
  'close record writes always execute the server-side project total capture',
);
requirePattern(
  /revoke all(?: privileges)? on function public\.capture_daily_close_project_minutes\(\) from public, anon, authenticated/i,
  'close total trigger function is not a Data API RPC',
);
requirePattern(
  /alter table public\.daily_close_records\s+disable trigger daily_close_capture_project_minutes;\s*select private\.exclude_legacy_daily_close_minutes\(\);\s*alter table public\.daily_close_records\s+enable trigger daily_close_capture_project_minutes;/is,
  'legacy close repair preserves verified residuals before re-enabling close trigger protection',
);
const softDeleteProject = readFunctionDefinition('soft_delete_project');
requireDefinitionPattern(
  softDeleteProject,
  /update public\.tasks set project_id = fallback\.id\s+where owner_id = current_owner and project_id = target\.id;/i,
  'project deletion moves every current task reference to fallback',
);
requirePattern(/deferrable initially immediate/i, 'deferrable workstation positions');
requirePattern(
  /set constraints workstation_owner_position_key deferred/i,
  'atomic reorder defer',
);
if (
  !/tasks_state_shape_check[\s\S]*?status <> 'waiting'[\s\S]*?scheduled_date is null[\s\S]*?status <> 'active'[\s\S]*?scheduled_date is not null/is.test(
    waitingTaskMigration,
  )
)
  throw new Error(
    'Supabase contract missing: waiting and active state shape constraints',
  );
if (
  !/p_transition not in \('scheduled', 'rescheduled', 'waiting', 'abandoned', 'trashed'\)[\s\S]*?update public\.tasks as tasks set[\s\S]*?schedule_pending_time[\s\S]*?planned_start_time[\s\S]*?planned_end_time[\s\S]*?planned_duration_minutes/is.test(
    waitingTaskMigration,
  )
)
  throw new Error(
    'Supabase contract missing: atomic waiting and scheduled transition shape',
  );
if (
  !/create or replace function public\.complete_waiting_task[\s\S]*?update public\.tasks set status = 'active', scheduled_date = p_completed_date[\s\S]*?completed = true/is.test(
    waitingTaskMigration,
  )
)
  throw new Error('Supabase contract missing: atomic waiting completion attribution');
requirePattern(
  /security definer\s+set search_path = pg_catalog/is,
  'fixed purge search_path',
);
for (const role of ['public', 'anon', 'authenticated'])
  requirePattern(
    new RegExp(
      `revoke all on function private\\.purge_expired_tasks\\(\\) from ${role}`,
      'i',
    ),
    `purge execute revoked from ${role}`,
  );
requirePattern(
  /revoke execute on function public\.rls_auto_enable\(\) from public, anon, authenticated/i,
  'platform RLS event-trigger helper cannot be invoked through Data API roles',
);
for (const table of [
  'workspace_profiles',
  'projects',
  'tasks',
  'daily_templates',
  'daily_template_items',
  'daily_entries',
  'daily_entry_items',
  'daily_history_entries',
  'history_events',
  'daily_close_records',
  'workstation_entries',
  'rhythm_marks',
])
  requirePattern(
    new RegExp(`grant [^;]+ on table public\\.${table} to authenticated`, 'i'),
    `authenticated runtime table privileges for ${table}`,
  );
for (const rpc of [
  'initialize_workspace\\(\\)',
  'ensure_daily_entries_for_date\\(date\\)',
  'record_daily_history\\(uuid, date, text\\)',
  'create_daily_template_with_entry\\(uuid, uuid, text, date\\)',
  'transition_task\\(uuid, text, date\\)',
  'complete_waiting_task\\(uuid, date\\)',
  'add_workstation_task\\(uuid\\)',
  'reorder_workstation\\(uuid\\[\\]\\)',
  'close_day\\(date, jsonb, jsonb\\)',
]) {
  requirePattern(
    new RegExp(`grant execute on function public\\.${rpc} to authenticated`, 'i'),
    `authenticated RPC execute for ${rpc}`,
  );
  requirePattern(
    new RegExp(
      `revoke all privileges on function public\\.${rpc}\\s+from public, anon, authenticated`,
      'i',
    ),
    `anonymous RPC execute revoked for ${rpc}`,
  );
}
for (const projectName of ['工作', '课程', 'AI研究', '生活', '其他'])
  requirePattern(new RegExp(`'${projectName}'`), `default project ${projectName}`);
requireDefinitionPattern(
  dailyManagerMigration,
  /ensure_daily_entries_for_date\(p_entry_date date\)[\s\S]*?security definer\s+set search_path = pg_catalog, public[\s\S]*?with inserted_entries as \([\s\S]*?on conflict \(owner_id, template_id, entry_date\) do nothing\s+returning id, owner_id, template_id[\s\S]*?from inserted_entries entries/i,
  'Daily materialization writes child snapshots only for newly inserted entries',
);
for (const rpc of [
  'create_daily_template_with_entry',
  'update_daily_template_bundle',
  'save_daily_entry_bundle',
  'set_daily_template_status',
  'set_daily_template_item_status',
])
  requireDefinitionPattern(
    dailyManagerMigration,
    new RegExp(
      `(?:create|create or replace) function public\\.${rpc}\\([\\s\\S]*?security definer\\s+set search_path = pg_catalog, public[\\s\\S]*?current_owner uuid := auth\\.uid\\(\\)`,
      'i',
    ),
    `${rpc} is an owner-scoped fixed-path security definer`,
  );
requireDefinitionPattern(
  dailyManagerMigration,
  /revoke all privileges on table public\.daily_templates, public\.daily_template_items,\s*public\.daily_entries, public\.daily_entry_items from public, anon, authenticated;\s*grant select on table public\.daily_templates, public\.daily_template_items,\s*public\.daily_entries, public\.daily_entry_items to authenticated;/i,
  'Daily template and entry tables are read-only for authenticated clients',
);
if (
  /grant\s+[^;]*\b(?:insert|update|delete)\b[^;]*\s+on table public\.daily_(?:templates|template_items|entries|entry_items)\s+to authenticated/i.test(
    dailyManagerMigration,
  )
)
  throw new Error(
    'Supabase contract violation: final Daily manager migration grants direct authenticated writes.',
  );
rejectPattern(/annotation_strokes/i, 'Annotation must remain local-only');
rejectPattern(/status\s*=\s*'purged'|\b'purged'\b/i, 'purged is not a TaskStatus');
// 旧工作区继续 last-write-wins；仅独立习惯领域采用显式版本冲突，不扩大旧模型边界。
const legacyMigrations = (
  await Promise.all(
    migrationFiles
      .filter(
        (name) =>
          !name.endsWith('_habits.sql') && !name.endsWith('_account_timezone.sql'),
      )
      .map((name) => readFile(join(migrationsDirectory, name), 'utf8')),
  )
).join('\n');
if (/expected_?version|\bversion\s+(?:integer|bigint)/i.test(legacyMigrations))
  throw new Error(
    'Supabase contract violation: version conflicts remain out of scope for the legacy workspace',
  );
const habitMigration = await readFile(
  join(migrationsDirectory, '202609120001_habits.sql'),
  'utf8',
);
for (const table of [
  'habit_settings',
  'habit_rule_versions',
  'habit_entries',
  'habit_entry_revisions',
]) {
  requireDefinitionPattern(
    habitMigration,
    new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
    `${table} has owner RLS`,
  );
}
requireDefinitionPattern(
  habitMigration,
  /foreign key \(owner_id, rule_id\)/i,
  'habit rules belong to the same account',
);
requireDefinitionPattern(
  habitMigration,
  /pg_advisory_xact_lock[\s\S]*HABIT_CONFLICT_ENTRY/i,
  'habit writes serialize and reject stale versions',
);
requireDefinitionPattern(
  habitMigration,
  /insert into public\.habit_entry_revisions[\s\S]*to_jsonb\(saved\)/i,
  'habit writes retain revision snapshots',
);
if (/grant\s+(?:insert|update|delete)[^;]*to authenticated/i.test(habitMigration))
  throw new Error('Habit tables cannot grant direct client writes');

console.log('Verified static Supabase architecture contract.');

// 账号时区沿用独立版本与权限边界，不扩展旧任务的并发模型。
const accountTimezoneMigration = await readFile(
  join(migrationsDirectory, '202609120002_account_timezone.sql'),
  'utf8',
);
requireDefinitionPattern(
  accountTimezoneMigration,
  /set_account_timezone[\s\S]*security definer[\s\S]*auth\.uid\(\)[\s\S]*pg_advisory_xact_lock/i,
  'account timezone is authenticated and serialized',
);
requireDefinitionPattern(
  accountTimezoneMigration,
  /p_expected_version is null[\s\S]*return settings[\s\S]*HABIT_CONFLICT_SETTINGS/i,
  'account timezone initialization cannot overwrite an existing preference',
);
requireDefinitionPattern(
  accountTimezoneMigration,
  /revoke all on function public\.set_account_timezone[\s\S]*from public, anon, authenticated/i,
  'account timezone RPC is not anonymous',
);
