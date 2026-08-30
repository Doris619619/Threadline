/** @fileoverview 在 Docker 不可用时静态守卫已审核的 Supabase 领域与安全边界。 */

import { readFile } from 'node:fs/promises';

const migration = (
  await Promise.all(
    [
      'supabase/migrations/202608300001_authoritative_workspace.sql',
      'supabase/migrations/202608300002_harden_platform_helpers.sql',
      'supabase/migrations/202608300003_fix_authenticated_runtime_privileges.sql',
    ].map((path) => readFile(path, 'utf8')),
  )
).join('\n');

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
requirePattern(/deferrable initially immediate/i, 'deferrable workstation positions');
requirePattern(
  /set constraints workstation_owner_position_key deferred/i,
  'atomic reorder defer',
);
requirePattern(
  /p_transition not in \('scheduled', 'rescheduled', 'backlog', 'abandoned', 'trashed'\)/i,
  'atomic scheduled task transition',
);
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
rejectPattern(/annotation_strokes/i, 'Annotation must remain local-only');
rejectPattern(/status\s*=\s*'purged'|\b'purged'\b/i, 'purged is not a TaskStatus');
rejectPattern(
  /expected_?version|\bversion\s+(?:integer|bigint)/i,
  'version conflicts are out of scope',
);

console.log('Verified static Supabase architecture contract.');
