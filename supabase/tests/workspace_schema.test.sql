-- 文件用途：用 pgTAP 验证 Threadline RLS、任务投入账本、Daily、工作站、回收站与权限边界。

begin;
create extension if not exists pgtap with schema extensions;
select plan(159);

select has_table('public', 'daily_history_entries', 'Daily history has an explicit table');
select has_table(
  'public', 'daily_close_record_daily_exclusions',
  'Legacy Daily close exclusions have an audit table'
);
select has_table('public', 'task_time_entries', 'Task actual time has an immutable date-bound table');
select has_table('public', 'rhythm_marks', 'Rhythm is cloud-backed');
select hasnt_table('public', 'annotation_strokes', 'Annotations stay local-only');
select has_function('public', 'initialize_workspace', array[]::text[], 'Workspace initializer exists');
select has_function(
  'public',
  'ensure_daily_entries_for_date',
  array['date'],
  'Daily materializer exists'
);
select has_function(
  'private',
  'purge_expired_tasks',
  array[]::text[],
  'Protected purge function exists'
);
select has_function(
  'private',
  'exclude_legacy_daily_close_minutes',
  array[]::text[],
  'Legacy Daily close repair helper exists'
);
select has_function(
  'public', 'soft_delete_project', array['uuid'],
  'Project soft delete RPC exists'
);
select has_function(
  'public', 'set_daily_template_status', array['uuid', 'text'],
  'Daily template lifecycle RPC exists'
);
select has_function(
  'public', 'set_daily_template_item_status', array['uuid', 'text'],
  'Daily item lifecycle RPC exists'
);
select hasnt_function(
  'public', 'update_daily_template_bundle',
  array['uuid', 'uuid', 'uuid', 'text', 'jsonb', 'jsonb'],
  'Legacy project-bound Daily update RPC is removed'
);
select has_column(
  'public', 'daily_template_items', 'planned_duration_minutes',
  'Daily template items persist planned minutes'
);
select has_column(
  'public', 'daily_entry_items', 'planned_duration_minutes_snapshot',
  'Daily entry items freeze planned minute snapshots'
);
select function_privs_are(
  'private',
  'purge_expired_tasks',
  array[]::text[],
  'authenticated',
  array[]::text[],
  'Authenticated clients cannot execute purge'
);
select function_privs_are(
  'private',
  'purge_expired_tasks',
  array[]::text[],
  'anon',
  array[]::text[],
  'Anonymous clients cannot execute purge'
);
select is(
  (
    select count(*)
    from pg_class as relations
    join pg_namespace as schemas on schemas.oid = relations.relnamespace
    where schemas.nspname = 'public' and relations.relkind = 'S'
  ),
  0::bigint,
  'UUID business schema requires no public sequence privileges'
);

select table_privs_are(
  'public', 'workspace_profiles', 'authenticated', array['SELECT', 'INSERT'],
  'Authenticated initializer can select and insert its workspace profile'
);
select table_privs_are(
  'public', 'projects', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
  'Authenticated Repository can read and save projects'
);
select table_privs_are(
  'public', 'tasks', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
  'Authenticated Repository can read and save tasks without physical delete'
);
select table_privs_are(
  'public', 'task_time_entries', 'authenticated', array['SELECT'],
  'Authenticated analytics can only read trigger-maintained task time entries'
);
select function_privs_are(
  'public', 'capture_task_actual_time', array[]::text[],
  'authenticated', array[]::text[], 'Authenticated clients cannot execute the task-time trigger function'
);
select function_privs_are(
  'public', 'capture_task_actual_time', array[]::text[],
  'anon', array[]::text[], 'Anonymous clients cannot execute the task-time trigger function'
);
select table_privs_are(
  'public', 'daily_templates', 'authenticated', array['SELECT'],
  'Authenticated clients can only read Daily templates directly'
);
select table_privs_are(
  'public', 'daily_template_items', 'authenticated', array['SELECT'],
  'Authenticated clients can only read Daily template items directly'
);
select table_privs_are(
  'public', 'daily_entries', 'authenticated', array['SELECT'],
  'Authenticated clients can only read Daily entries directly'
);
select table_privs_are(
  'public', 'daily_entry_items', 'authenticated', array['SELECT'],
  'Authenticated clients can only read Daily entry items directly'
);
select table_privs_are(
  'public', 'daily_history_entries', 'authenticated', array['SELECT', 'INSERT'],
  'Authenticated Daily recording can read and append formal history'
);
select table_privs_are(
  'public', 'history_events', 'authenticated', array['SELECT', 'INSERT'],
  'Authenticated task flow can read and append history events'
);
select table_privs_are(
  'public', 'daily_close_records', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
  'Authenticated close day can read and upsert close records'
);
select table_privs_are(
  'public', 'workstation_entries', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
  'Authenticated workstation can read, add, remove, and reorder memberships'
);
select table_privs_are(
  'public', 'rhythm_marks', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
  'Authenticated Rhythm can read and upsert marks'
);
select is(
  (
    select count(*)
    from unnest(array[
      'workspace_profiles', 'projects', 'tasks', 'task_time_entries', 'daily_templates',
      'daily_template_items', 'daily_entries', 'daily_entry_items',
      'daily_history_entries', 'history_events', 'daily_close_records',
      'workstation_entries', 'rhythm_marks'
    ]) as business_tables(table_name)
    where has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', table_name), 'DELETE')
  ),
  0::bigint,
  'Anonymous clients have no business-table privileges'
);

-- 后续 fixture 需要直接构造历史数据；事务结束会回滚临时 grant，真实 schema 仍保持上述只读边界。
grant insert, update, delete on table public.daily_templates, public.daily_template_items,
  public.daily_entries, public.daily_entry_items to authenticated;

select function_privs_are(
  'public', 'initialize_workspace', array[]::text[],
  'authenticated', array['EXECUTE'], 'Authenticated can initialize workspace'
);
select function_privs_are(
  'public', 'ensure_daily_entries_for_date', array['date'],
  'authenticated', array['EXECUTE'], 'Authenticated can materialize Daily date'
);
select function_privs_are(
  'public', 'record_daily_history', array['uuid', 'date', 'text'],
  'authenticated', array['EXECUTE'], 'Authenticated can record Daily history'
);
select function_privs_are(
  'public', 'create_daily_template_with_entry', array['uuid', 'text', 'jsonb', 'date'],
  'authenticated', array['EXECUTE'], 'Authenticated can create Daily atomically'
);
select function_privs_are(
  'public', 'transition_task', array['uuid', 'text', 'date'],
  'authenticated', array['EXECUTE'], 'Authenticated can transition tasks'
);
select function_privs_are(
  'public', 'add_workstation_task', array['uuid'],
  'authenticated', array['EXECUTE'], 'Authenticated can add workstation task'
);
select function_privs_are(
  'public', 'reorder_workstation', array['uuid[]'],
  'authenticated', array['EXECUTE'], 'Authenticated can reorder workstation'
);
select function_privs_are(
  'public', 'close_day', array['date', 'jsonb', 'jsonb'],
  'authenticated', array['EXECUTE'], 'Authenticated can close day'
);
select function_privs_are(
  'public', 'save_daily_entry_bundle', array['uuid', 'text', 'boolean', 'integer', 'text', 'jsonb'],
  'authenticated', array['EXECUTE'], 'Authenticated can atomically save a Daily entry bundle'
);
select function_privs_are(
  'public', 'update_daily_template_bundle', array['uuid', 'text', 'jsonb'],
  'authenticated', array['EXECUTE'], 'Authenticated can atomically update a Daily template and current entry'
);
select function_privs_are(
  'public', 'daily_entry_total_actual', array['uuid'],
  'authenticated', array['EXECUTE'], 'Authenticated can calculate an owner-scoped Daily total'
);
select function_privs_are(
  'public', 'capture_daily_close_project_minutes', array[]::text[],
  'authenticated', array[]::text[], 'Authenticated clients cannot execute the close-total trigger function'
);

select function_privs_are(
  'public', 'initialize_workspace', array[]::text[],
  'anon', array[]::text[], 'Anonymous clients cannot initialize workspace'
);
select function_privs_are(
  'public', 'ensure_daily_entries_for_date', array['date'],
  'anon', array[]::text[], 'Anonymous clients cannot materialize Daily date'
);
select function_privs_are(
  'public', 'record_daily_history', array['uuid', 'date', 'text'],
  'anon', array[]::text[], 'Anonymous clients cannot record Daily history'
);
select function_privs_are(
  'public', 'create_daily_template_with_entry', array['uuid', 'text', 'jsonb', 'date'],
  'anon', array[]::text[], 'Anonymous clients cannot create Daily'
);
select function_privs_are(
  'public', 'transition_task', array['uuid', 'text', 'date'],
  'anon', array[]::text[], 'Anonymous clients cannot transition tasks'
);
select function_privs_are(
  'public', 'add_workstation_task', array['uuid'],
  'anon', array[]::text[], 'Anonymous clients cannot add workstation task'
);
select function_privs_are(
  'public', 'reorder_workstation', array['uuid[]'],
  'anon', array[]::text[], 'Anonymous clients cannot reorder workstation'
);
select function_privs_are(
  'public', 'close_day', array['date', 'jsonb', 'jsonb'],
  'anon', array[]::text[], 'Anonymous clients cannot close day'
);
select function_privs_are(
  'public', 'save_daily_entry_bundle', array['uuid', 'text', 'boolean', 'integer', 'text', 'jsonb'],
  'anon', array[]::text[], 'Anonymous clients cannot save a Daily entry bundle'
);
select function_privs_are(
  'public', 'update_daily_template_bundle', array['uuid', 'text', 'jsonb'],
  'anon', array[]::text[], 'Anonymous clients cannot update a Daily template and current entry'
);
select function_privs_are(
  'public', 'daily_entry_total_actual', array['uuid'],
  'anon', array[]::text[], 'Anonymous clients cannot calculate Daily totals'
);
select function_privs_are(
  'public', 'capture_daily_close_project_minutes', array[]::text[],
  'anon', array[]::text[], 'Anonymous clients cannot execute the close-total trigger function'
);

insert into auth.users(id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'owner-a@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'owner-b@example.test');

insert into public.projects(
  id, owner_id, name, color, status, position, is_fallback
) values (
  '21000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  'Owner B project', '#123456', 'active', 0, true
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select is(
  (select count(*) from public.initialize_workspace()),
  5::bigint,
  'Initializer returns five default projects'
);
select is(
  (select count(*) from public.initialize_workspace()),
  5::bigint,
  'Initializer is idempotent'
);
select is(
  (select count(*) from public.projects where is_fallback),
  1::bigint,
  'Owner has exactly one fallback project'
);
select is(
  (select count(*) from public.projects where is_fallback and status = 'active'),
  1::bigint,
  'Fallback project is active'
);
select throws_ok(
  $$update public.projects set status = 'archived' where is_fallback$$,
  '23514',
  null,
  'Fallback project cannot be archived'
);
select throws_ok(
  $$insert into public.projects(name, color, status, position, is_fallback)
    values ('Second fallback', '#654321', 'active', 9, true)$$,
  '23505',
  null,
  'Owner cannot create a second fallback project'
);
select throws_ok(
  $$insert into public.tasks(id, project_id, title, scheduled_date, completed, status)
    values (
      '22000000-0000-0000-0000-000000000002',
      '21000000-0000-0000-0000-000000000002',
      'Cross-owner task', '2026-09-04', false, 'active'
    )$$,
  '23503',
  null,
  'Same-owner foreign key rejects cross-owner task project'
);

insert into public.daily_templates(id, project_id, title, is_active, position)
select
  '30000000-0000-0000-0000-000000000003',
  id,
  'Daily A',
  true,
  0
from public.projects
where owner_id = auth.uid() and position = 0;

insert into public.daily_template_items(id, template_id, title, position)
values (
  '31000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000003',
  'Template child',
  0
);

select lives_ok(
  $$select public.ensure_daily_entries_for_date('2026-08-30')$$,
  'First Daily materialization succeeds'
);
select lives_ok(
  $$select public.ensure_daily_entries_for_date('2026-08-30')$$,
  'Repeated Daily materialization succeeds'
);
select is(
  (select count(*) from public.daily_entries where entry_date = '2026-08-30'),
  1::bigint,
  'Daily materialization is idempotent'
);
select is(
  (select count(*) from public.daily_entry_items),
  1::bigint,
  'Daily template item is copied exactly once'
);
insert into public.daily_template_items(id, template_id, title, position)
values (
  '31000000-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000003',
  'Later template child',
  1
);
select lives_ok(
  $$select public.ensure_daily_entries_for_date('2026-08-30')$$,
  'Repeated materialization after a template append succeeds without revising the existing entry'
);
select is(
  (select count(*) from public.daily_entry_items where entry_id = (
    select id from public.daily_entries where entry_date = '2026-08-30'
  )),
  1::bigint,
  'Template append does not backfill a previously materialized date entry'
);

insert into public.daily_templates(id, project_id, title, is_active, position)
select
  '32000000-0000-0000-0000-000000000003',
  id,
  'Daily B',
  false,
  1
from public.projects
where owner_id = auth.uid() and position = 0;
insert into public.daily_template_items(id, template_id, title, position)
values (
  '33000000-0000-0000-0000-000000000003',
  '32000000-0000-0000-0000-000000000003',
  'Other template child',
  0
);
select throws_ok(
  $$insert into public.daily_entry_items(
      entry_id, template_item_id, title_snapshot, position, completed
    )
    select id, '33000000-0000-0000-0000-000000000003', 'Invalid mapping', 9, false
    from public.daily_entries
    where template_id = '30000000-0000-0000-0000-000000000003'
      and entry_date = '2026-08-30'$$,
  '23514',
  'DAILY_TEMPLATE_ITEM_MISMATCH',
  'Daily item mapping cannot cross templates'
);

update public.daily_entries
set title_snapshot = 'Only date A', actual_duration_minutes = 25
where entry_date = '2026-08-30';
insert into public.daily_entry_items(
  entry_id, template_item_id, title_snapshot, position, completed, actual_duration_minutes
)
select id, null, 'Date-only child', 1, true, 5
from public.daily_entries
where entry_date = '2026-08-30';
select public.ensure_daily_entries_for_date('2026-08-31');

select is(
  (select title_snapshot from public.daily_entries where entry_date = '2026-08-31'),
  'Daily A',
  'Editing date A does not change date B title'
);
select is(
  (
    select count(*)
    from public.daily_entry_items as items
    join public.daily_entries as entries on entries.id = items.entry_id
    where entries.entry_date = '2026-08-31'
  ),
  2::bigint,
  'Future entry receives the two current template items but not the date-only child'
);
select is(
  (
    select count(*)
    from public.daily_entry_items as items
    join public.daily_entries as entries on entries.id = items.entry_id
    where entries.entry_date = '2026-08-31' and items.title_snapshot = 'Later template child'
  ),
  1::bigint,
  'Template child appended after date A materializes only for the future date'
);

select lives_ok(
  $$select public.record_daily_history(
    '30000000-0000-0000-0000-000000000003', '2026-08-30', 'manual'
  )$$,
  'Manual Daily record succeeds'
);
select lives_ok(
  $$select public.record_daily_history(
    '30000000-0000-0000-0000-000000000003', '2026-08-30', 'close_day'
  )$$,
  'Close-day record reuses existing history'
);
select is(
  (select count(*) from public.daily_history_entries where entry_date = '2026-08-30'),
  1::bigint,
  'Daily history is unique by template and date'
);
select is(
  (select record_source from public.daily_history_entries where entry_date = '2026-08-30'),
  'manual',
  'Close day does not overwrite a manual record'
);

insert into public.tasks(
  id, project_id, title, scheduled_date, actual_duration_minutes, completed, status
)
select
  values_to_insert.id,
  projects.id,
  values_to_insert.title,
  '2026-08-30',
  values_to_insert.actual_duration_minutes,
  false,
  'active'
from public.projects as projects
cross join (values
  ('40000000-0000-0000-0000-000000000004'::uuid, 'Task A', 37),
  ('41000000-0000-0000-0000-000000000004'::uuid, 'Task B', 0)
) as values_to_insert(id, title, actual_duration_minutes)
where projects.owner_id = auth.uid() and projects.position = 0;

-- 新建日程必须是可直接保存的 active 形状，并由数据库默认补全 normal 重要性。
select lives_ok(
  $$insert into public.tasks(id, project_id, title, scheduled_date, completed, status)
    select '41500000-0000-0000-0000-000000000004', id, 'New scheduled task', '2026-09-04', false, 'active'
    from public.projects where owner_id = auth.uid() and position = 0$$,
  'A newly saved scheduled task satisfies the active state shape'
);
select is(
  (select importance from public.tasks where id = '41500000-0000-0000-0000-000000000004'),
  'normal',
  'A newly saved scheduled task receives normal importance'
);
select throws_ok(
  $$insert into public.tasks(id, project_id, title, scheduled_date, completed, status)
    select '41600000-0000-0000-0000-000000000004', id, 'legacy-invalid-state', null, false, 'active'
    from public.projects where owner_id = auth.uid() and position = 0$$,
  '23514',
  null,
  'Legacy-invalid-state active task without a date is rejected after migration'
);

reset role;
alter table public.tasks disable trigger tasks_capture_actual_time;
insert into public.tasks(
  id, owner_id, project_id, title, scheduled_date,
  actual_duration_minutes, completed, status
)
select
  '42000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  projects.id,
  'Legacy undated actual',
  '2026-09-03',
  100,
  false,
  'active'
from public.projects as projects
where projects.owner_id = '10000000-0000-0000-0000-000000000001'
  and projects.position = 0;
alter table public.tasks enable trigger tasks_capture_actual_time;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select throws_ok(
  $$update public.tasks
    set actual_duration_minutes = 90
    where id = '42000000-0000-0000-0000-000000000004'$$,
  '22023',
  'TASK_ACTUAL_BELOW_FIXED_HISTORY',
  'Reducing a legacy unattributed aggregate cannot invent a current-date ledger bucket'
);
select is(
  (select actual_duration_minutes from public.tasks where id = '42000000-0000-0000-0000-000000000004'),
  100,
  'Rejected legacy correction preserves the aggregate actual minutes'
);
select is(
  (select count(*) from public.task_time_entries where task_id = '42000000-0000-0000-0000-000000000004'),
  0::bigint,
  'Rejected legacy correction keeps unknown historical minutes unattributed'
);

reset role;
select throws_ok(
  $$insert into public.task_time_entries(owner_id, task_id, entry_date, project_id, minutes)
    values (
      '20000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000004',
      '2026-09-01',
      '21000000-0000-0000-0000-000000000002',
      91
    )$$,
  '23503',
  null,
  'Composite owner-task foreign key rejects a task owned by another account'
);
select throws_ok(
  $$insert into public.task_time_entries(owner_id, task_id, entry_date, project_id, minutes)
    values (
      '10000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000004',
      '2026-09-02',
      '21000000-0000-0000-0000-000000000002',
      92
    )$$,
  '23503',
  null,
  'Composite owner-project foreign key rejects a project owned by another account'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

-- close_day -> waiting 必须与 transition_task -> waiting 使用同一状态形状。
insert into public.tasks(
  id, project_id, title, scheduled_date, schedule_pending_time,
  planned_start_time, planned_end_time, planned_duration_minutes, completed, status
)
select
  '41700000-0000-0000-0000-000000000004', id, 'Close into waiting', '2026-09-04', false,
  '09:00', '10:00', 60, false, 'active'
from public.projects where owner_id = auth.uid() and position = 0;
select lives_ok(
  $$select public.close_day(
    '2026-09-04',
    '[{"task_id":"41700000-0000-0000-0000-000000000004","action":"waiting"}]'::jsonb,
    '{}'::jsonb
  )$$,
  'Close day can atomically move an active task into waiting'
);
select is(
  (
    select status || ':' || coalesce(scheduled_date::text, '—') || ':' || schedule_pending_time::text
      || ':' || (planned_start_time is null)::text || ':' || (planned_end_time is null)::text
      || ':' || (planned_duration_minutes is null)::text
    from public.tasks where id = '41700000-0000-0000-0000-000000000004'
  ),
  'waiting:—:false:true:true:true',
  'Close-day waiting clears every schedule field in its single task update'
);
select is(
  (select event_type from public.history_events where task_id = '41700000-0000-0000-0000-000000000004'),
  'close_waiting',
  'Close-day waiting writes the dedicated close_waiting history event'
);

-- waiting 直接完成先归属客户端本地日期，完成触发器才能写正确快照与统计账本。
insert into public.tasks(id, project_id, title, completed, status)
select '41800000-0000-0000-0000-000000000004', id, 'Complete waiting directly', false, 'waiting'
from public.projects where owner_id = auth.uid() and position = 0;
select lives_ok(
  $$select public.complete_waiting_task('41800000-0000-0000-0000-000000000004', '2026-09-04')$$,
  'Waiting task can complete through the atomic local-date RPC'
);
select is(
  (
    select status || ':' || scheduled_date::text || ':' || schedule_pending_time::text
      || ':' || (planned_start_time is null)::text || ':' || completed::text
    from public.tasks where id = '41800000-0000-0000-0000-000000000004'
  ),
  'active:2026-09-04:false:true:true',
  'Direct waiting completion becomes a visible active task on the supplied local date'
);
select is(
  (
    select task_date_snapshot from public.history_events
    where task_id = '41800000-0000-0000-0000-000000000004' and event_type = 'completed'
  ),
  '2026-09-04'::date,
  'Direct waiting completion history snapshots the supplied local date'
);

select lives_ok(
  $$select public.add_workstation_task('40000000-0000-0000-0000-000000000004')$$,
  'Adding workstation membership succeeds'
);
select lives_ok(
  $$select public.add_workstation_task('41000000-0000-0000-0000-000000000004')$$,
  'Adding second workstation membership succeeds'
);
update public.workstation_entries
set removed_at = now(), position = null
where task_id = '40000000-0000-0000-0000-000000000004';
select is(
  (select position from public.workstation_entries where task_id = '40000000-0000-0000-0000-000000000004'),
  null::integer,
  'Removed membership has null position'
);
select lives_ok(
  $$select public.add_workstation_task('40000000-0000-0000-0000-000000000004')$$,
  'Re-adding membership allocates a tail position'
);
select is(
  (select position from public.workstation_entries where task_id = '40000000-0000-0000-0000-000000000004'),
  2,
  'Re-added membership is placed at the active tail'
);
select lives_ok(
  $$select * from public.reorder_workstation(array[
    '40000000-0000-0000-0000-000000000004'::uuid,
    '41000000-0000-0000-0000-000000000004'::uuid
  ])$$,
  'Workstation reorder atomically swaps positions'
);
select is(
  (select position from public.workstation_entries where task_id = '40000000-0000-0000-0000-000000000004'),
  0,
  'Reorder writes the requested first position'
);
select throws_ok(
  $$select * from public.reorder_workstation(array[
    '40000000-0000-0000-0000-000000000004'::uuid
  ])$$,
  '22023',
  'WORKSTATION_SET_MISMATCH',
  'Mismatched reorder is rejected'
);
select is(
  (select position from public.workstation_entries where task_id = '41000000-0000-0000-0000-000000000004'),
  1,
  'Rejected reorder leaves prior ordering intact'
);

select lives_ok(
  $$select public.transition_task(
    '40000000-0000-0000-0000-000000000004', 'trashed', null
  )$$,
  'Trash transition succeeds'
);
select is(
  (select status from public.tasks where id = '40000000-0000-0000-0000-000000000004'),
  'trashed',
  'Trash transition updates task state'
);
select is(
  (select count(*) from public.history_events where task_id = '40000000-0000-0000-0000-000000000004'),
  1::bigint,
  'Trash transition writes history'
);
select is(
  (select position from public.workstation_entries where task_id = '40000000-0000-0000-0000-000000000004'),
  null::integer,
  'Trash transition removes workstation position'
);
select is(
  (select postponed_from from public.tasks where id = '40000000-0000-0000-0000-000000000004'),
  null::date,
  'Direct trash does not invent a postponement date'
);
select is(
  (
    select event_type || ':' || task_date_snapshot::text
    from public.history_events
    where task_id = '40000000-0000-0000-0000-000000000004'
    order by occurred_at desc
    limit 1
  ),
  'trashed:2026-08-30',
  'Trash history preserves the deletion-date snapshot'
);
select lives_ok(
  $$update public.tasks
    set status = 'active', scheduled_date = '2026-08-30', deleted_at = null
    where id = '40000000-0000-0000-0000-000000000004'$$,
  'Restoring trash through ordinary task update succeeds'
);
select is(
  (
    select status || ':' || scheduled_date::text || ':' || (deleted_at is null)::text
    from public.tasks
    where id = '40000000-0000-0000-0000-000000000004'
  ),
  'active:2026-08-30:true',
  'Restore returns the task to the selected business date and clears deleted_at'
);
select is(
  (select position from public.workstation_entries where task_id = '40000000-0000-0000-0000-000000000004'),
  null::integer,
  'Restore keeps the prior workstation membership removed'
);

insert into public.projects(id, owner_id, name, color, status, position, is_fallback)
values (
  '45000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'Deleted project task owner', '#3979e8', 'active', 20, false
);
insert into public.tasks(
  id, project_id, title, scheduled_date, actual_duration_minutes, completed, status
) values (
  '46000000-0000-0000-0000-000000000004',
  '45000000-0000-0000-0000-000000000004',
  'Restore after project delete', '2026-08-27', 12, false, 'active'
);
select lives_ok(
  $$select public.transition_task(
    '46000000-0000-0000-0000-000000000004', 'trashed', null
  )$$,
  'Task with historical actual can enter trash before its project is deleted'
);
select lives_ok(
  $$select public.soft_delete_project('45000000-0000-0000-0000-000000000004')$$,
  'Soft deletion migrates every current task reference, including trash'
);
select is(
  (
    select tasks.project_id
    from public.tasks
    where tasks.id = '46000000-0000-0000-0000-000000000004'
  ),
  (
    select projects.id
    from public.projects
    where projects.owner_id = auth.uid() and projects.is_fallback
  ),
  'Trashed task now points to fallback before it can be restored'
);
select is(
  (
    select entries.project_id
    from public.task_time_entries as entries
    where entries.task_id = '46000000-0000-0000-0000-000000000004'
      and entries.entry_date = '2026-08-27'
  ),
  '45000000-0000-0000-0000-000000000004'::uuid,
  'Existing task ledger keeps the deleted project identity'
);
select lives_ok(
  $$update public.tasks
    set status = 'active', scheduled_date = '2026-09-02', deleted_at = null
    where id = '46000000-0000-0000-0000-000000000004'$$,
  'Restoring the trashed task retains its fallback assignment'
);
select is(
  (
    select tasks.project_id
    from public.tasks
    where tasks.id = '46000000-0000-0000-0000-000000000004'
  ),
  (
    select projects.id
    from public.projects
    where projects.owner_id = auth.uid() and projects.is_fallback
  ),
  'Restored task cannot silently return to the deleted project'
);
select lives_ok(
  $$update public.tasks
    set actual_duration_minutes = 20
    where id = '46000000-0000-0000-0000-000000000004'$$,
  'Restored task can record additional actual time'
);
select is(
  (
    select entries.project_id
    from public.task_time_entries as entries
    where entries.task_id = '46000000-0000-0000-0000-000000000004'
      and entries.entry_date = '2026-09-02'
  ),
  (
    select projects.id
    from public.projects
    where projects.owner_id = auth.uid() and projects.is_fallback
  ),
  'New task actual ledger uses fallback rather than the deleted project'
);
select lives_ok(
  $$select public.transition_task(
    '40000000-0000-0000-0000-000000000004', 'trashed', null
  )$$,
  'Task can be trashed again after restoration'
);
select throws_ok(
  $$select private.purge_expired_tasks()$$,
  '42501',
  null,
  'Authenticated role cannot invoke purge'
);

reset role;
update public.tasks
set deleted_at = now() - interval '31 days'
where id = '40000000-0000-0000-0000-000000000004';
select is(private.purge_expired_tasks(), 1::bigint, 'Trusted purge deletes expired trash');
select is(
  (select count(*) from public.history_events where task_title_snapshot = 'Task A'),
  2::bigint,
  'Physical task deletion retains history snapshot'
);
select is(
  (
    select count(*)
    from public.task_time_entries
    where owner_id = '10000000-0000-0000-0000-000000000001'
      and entry_date = '2026-08-30'
      and minutes = 37
      and task_id is null
  ),
  1::bigint,
  'Physical task deletion retains dated actual time while clearing task_id'
);

-- 模拟 20260901 前已落库的 close：raw 项目分钟 = task 40 + Daily exact 60 + 不可进一步归因的 residual 30。
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select lives_ok(
  $$select public.ensure_daily_entries_for_date('2026-08-29')$$,
  'Legacy migration fixture materializes the historical Daily entry'
);
update public.daily_entries
set actual_duration_minutes = 60,
    legacy_project_id = (
      select id from public.projects where owner_id = auth.uid() and position = 0
    )
where owner_id = auth.uid() and entry_date = '2026-08-29';

-- Case 1/2：formal history 必须胜过随后被编辑过的 current Daily entry。
select lives_ok(
  $$select public.ensure_daily_entries_for_date('2026-08-27')$$,
  'History-priority fixture materializes the first historical Daily entry'
);
update public.daily_entries
set actual_duration_minutes = 60,
    legacy_project_id = (
      select id from public.projects where owner_id = auth.uid() and position = 0
    )
where owner_id = auth.uid() and entry_date = '2026-08-27';
select lives_ok(
  $$select public.record_daily_history(
    (select template_id from public.daily_entries
      where owner_id = auth.uid() and entry_date = '2026-08-27'),
    '2026-08-27', 'manual'
  )$$,
  'Formal Daily history captures the close-time actual before a later entry edit'
);
reset role;
update public.daily_history_entries
set legacy_project_id = (
  select id from public.projects
  where owner_id = '10000000-0000-0000-0000-000000000001' and position = 0
)
where owner_id = '10000000-0000-0000-0000-000000000001'
  and entry_date = '2026-08-27';
select is(
  (select actual_duration_minutes from public.daily_history_entries where entry_date = '2026-08-27'),
  60,
  'Formal Daily history preserves the original 60-minute actual'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
update public.daily_entries
set actual_duration_minutes = 30
where owner_id = auth.uid() and entry_date = '2026-08-27';
select is(
  (select actual_duration_minutes from public.daily_entries where entry_date = '2026-08-27'),
  30,
  'Current Daily entry can diverge after history is recorded'
);

select lives_ok(
  $$select public.ensure_daily_entries_for_date('2026-08-26')$$,
  'History-priority fixture materializes the residual Daily entry'
);
update public.daily_entries
set actual_duration_minutes = 60,
    legacy_project_id = (
      select id from public.projects where owner_id = auth.uid() and position = 0
    )
where owner_id = auth.uid() and entry_date = '2026-08-26';
select lives_ok(
  $$select public.record_daily_history(
    (select template_id from public.daily_entries
      where owner_id = auth.uid() and entry_date = '2026-08-26'),
    '2026-08-26', 'manual'
  )$$,
  'Formal Daily history is available for the residual close fixture'
);
reset role;
update public.daily_history_entries
set legacy_project_id = (
  select id from public.projects
  where owner_id = '10000000-0000-0000-0000-000000000001' and position = 0
)
where owner_id = '10000000-0000-0000-0000-000000000001'
  and entry_date = '2026-08-26';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
update public.daily_entries
set actual_duration_minutes = 30
where owner_id = auth.uid() and entry_date = '2026-08-26';

-- 20260830 的 history 只保存父项 20；旧 close 则已经保存父项 20 + child 40。
select lives_ok(
  $$select public.ensure_daily_entries_for_date('2026-08-25')$$,
  'Parent-only history fixture materializes the pre-20260831 Daily entry'
);
update public.daily_entries
set actual_duration_minutes = 20,
    legacy_project_id = (
      select id from public.projects where owner_id = auth.uid() and position = 0
    )
where owner_id = auth.uid() and entry_date = '2026-08-25';
update public.daily_entry_items as items
set actual_duration_minutes = 40
from public.daily_entries as entries
where entries.owner_id = auth.uid() and entries.entry_date = '2026-08-25'
  and items.owner_id = entries.owner_id and items.entry_id = entries.id
  and items.template_item_id = '31000000-0000-0000-0000-000000000003';
select lives_ok(
  $$select public.record_daily_history(
    (select template_id from public.daily_entries
      where owner_id = auth.uid() and entry_date = '2026-08-25'),
    '2026-08-25', 'manual'
  )$$,
  'Current history trigger first records the parent-and-child total for the compatibility fixture'
);
reset role;
update public.daily_history_entries
set actual_duration_minutes = 20,
    legacy_project_id = (
      select id from public.projects
      where owner_id = '10000000-0000-0000-0000-000000000001' and position = 0
    )
where owner_id = '10000000-0000-0000-0000-000000000001'
  and entry_date = '2026-08-25';
select is(
  (select actual_duration_minutes from public.daily_history_entries where entry_date = '2026-08-25'),
  20,
  'Compatibility fixture precisely represents the historical parent-only 20-minute history'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
insert into public.tasks(
  id, project_id, title, scheduled_date, actual_duration_minutes, completed, status
)
select
  '43000000-0000-0000-0000-000000000004', id,
  'Legacy close task residual', '2026-08-29', 40, false, 'active'
from public.projects
where owner_id = auth.uid() and position = 0;
insert into public.tasks(
  id, project_id, title, scheduled_date, actual_duration_minutes, completed, status
)
select
  '43000000-0000-0000-0000-000000000006', id,
  'History-priority exact close task', '2026-08-27', 40, false, 'active'
from public.projects
where owner_id = auth.uid() and position = 0;
insert into public.tasks(
  id, project_id, title, scheduled_date, actual_duration_minutes, completed, status
)
select
  '43000000-0000-0000-0000-000000000007', id,
  'History-priority residual close task', '2026-08-26', 40, false, 'active'
from public.projects
where owner_id = auth.uid() and position = 0;

reset role;
alter table public.daily_close_records disable trigger daily_close_capture_project_minutes;
insert into public.daily_close_records(id, owner_id, close_date, project_minutes)
select
  '44000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  '2026-08-29',
  jsonb_build_object(id::text, 130)
from public.projects
where owner_id = '10000000-0000-0000-0000-000000000001' and position = 0;
insert into public.daily_close_records(id, owner_id, close_date, project_minutes)
select
  '44000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  '2026-08-27',
  jsonb_build_object(id::text, 100)
from public.projects
where owner_id = '10000000-0000-0000-0000-000000000001' and position = 0;
insert into public.daily_close_records(id, owner_id, close_date, project_minutes)
select
  '44000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000001',
  '2026-08-26',
  jsonb_build_object(id::text, 130)
from public.projects
where owner_id = '10000000-0000-0000-0000-000000000001' and position = 0;
insert into public.daily_close_records(id, owner_id, close_date, project_minutes)
select
  '44000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000001',
  '2026-08-25',
  jsonb_build_object(id::text, 60)
from public.projects
where owner_id = '10000000-0000-0000-0000-000000000001' and position = 0;
alter table public.daily_close_records enable trigger daily_close_capture_project_minutes;
-- 模拟 migration 的精确窗口：repair 可写经核对的 snapshot，完成后立刻恢复防伪 trigger。
alter table public.daily_close_records disable trigger daily_close_capture_project_minutes;
select is(
  private.exclude_legacy_daily_close_minutes(),
  4,
  'Legacy close repair handles entry fallback, total history, and a parent-only history allocation'
);
alter table public.daily_close_records enable trigger daily_close_capture_project_minutes;
select is(
  (
    select (records.project_minutes ->> projects.id::text)::integer
    from public.daily_close_records as records
    join public.projects on projects.owner_id = records.owner_id and projects.position = 0
    where records.id = '44000000-0000-0000-0000-000000000004'
  ),
  70,
  'Legacy close retains unclassified task residual while removing Daily from project analytics'
);
select is(
  (
    select daily_minutes
    from public.daily_close_record_daily_exclusions
    where close_record_id = '44000000-0000-0000-0000-000000000004'
  ),
  60,
  'Legacy close audit preserves the exact excluded Daily minutes'
);
select is(
  (
    select (records.project_minutes ->> projects.id::text)::integer
    from public.daily_close_records as records
    join public.projects on projects.owner_id = records.owner_id and projects.position = 0
    where records.id = '44000000-0000-0000-0000-000000000005'
  ),
  40,
  'History-priority repair uses formal 60 instead of mutable 30 for a fully covered close'
);
select is(
  (
    select daily_minutes
    from public.daily_close_record_daily_exclusions
    where close_record_id = '44000000-0000-0000-0000-000000000005'
  ),
  60,
  'History-priority audit records the immutable 60-minute Daily exclusion'
);
select is(
  (
    select (records.project_minutes ->> projects.id::text)::integer
    from public.daily_close_records as records
    join public.projects on projects.owner_id = records.owner_id and projects.position = 0
    where records.id = '44000000-0000-0000-0000-000000000006'
  ),
  70,
  'History-priority repair retains the 30-minute task residual after excluding formal Daily 60'
);
select is(
  (
    select daily_minutes
    from public.daily_close_record_daily_exclusions
    where close_record_id = '44000000-0000-0000-0000-000000000006'
  ),
  60,
  'History-priority residual audit never uses the later 30-minute current entry'
);
select is(
  (
    select (records.project_minutes ->> projects.id::text)::integer
    from public.daily_close_records as records
    join public.projects on projects.owner_id = records.owner_id and projects.position = 0
    where records.id = '44000000-0000-0000-0000-000000000007'
  ),
  0,
  'Parent-only 20 plus child 40 is fully removed from the old 60-minute project close'
);
select is(
  (
    select daily_minutes
    from public.daily_close_record_daily_exclusions
    where close_record_id = '44000000-0000-0000-0000-000000000007'
  ),
  60,
  'Parent-only history audit records the reconstructed 20-plus-40 Daily total'
);
select is(
  private.exclude_legacy_daily_close_minutes(),
  0,
  'Legacy close repair is idempotent after its audit row is recorded'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select lives_ok(
  $$select public.ensure_daily_entries_for_date('2026-08-24')$$,
  'Ambiguous parent-only history fixture materializes a Daily entry'
);
update public.daily_entries
set actual_duration_minutes = 20,
    legacy_project_id = (
      select id from public.projects where owner_id = auth.uid() and position = 0
    )
where owner_id = auth.uid() and entry_date = '2026-08-24';
update public.daily_entry_items as items
set actual_duration_minutes = 40
from public.daily_entries as entries
where entries.owner_id = auth.uid() and entries.entry_date = '2026-08-24'
  and items.owner_id = entries.owner_id and items.entry_id = entries.id
  and items.template_item_id = '31000000-0000-0000-0000-000000000003';
select lives_ok(
  $$select public.record_daily_history(
    (select template_id from public.daily_entries
      where owner_id = auth.uid() and entry_date = '2026-08-24'),
    '2026-08-24', 'manual'
  )$$,
  'Ambiguous fixture records its initial parent-and-child total'
);
reset role;
update public.daily_history_entries
set actual_duration_minutes = 20,
    legacy_project_id = (
      select id from public.projects
      where owner_id = '10000000-0000-0000-0000-000000000001' and position = 0
    )
where owner_id = '10000000-0000-0000-0000-000000000001'
  and entry_date = '2026-08-24';
reset role;
alter table public.daily_entry_items disable trigger daily_entry_items_touch_updated_at;
update public.daily_entry_items as items
set actual_duration_minutes = 50,
    updated_at = (
      select history.recorded_at + interval '1 second'
      from public.daily_history_entries as history
      where history.owner_id = '10000000-0000-0000-0000-000000000001'
        and history.entry_date = '2026-08-24'
    )
from public.daily_entries as entries
where entries.owner_id = '10000000-0000-0000-0000-000000000001'
  and entries.entry_date = '2026-08-24'
  and items.owner_id = entries.owner_id and items.entry_id = entries.id;
alter table public.daily_entry_items enable trigger daily_entry_items_touch_updated_at;
alter table public.daily_close_records disable trigger daily_close_capture_project_minutes;
insert into public.daily_close_records(id, owner_id, close_date, project_minutes)
select
  '44000000-0000-0000-0000-000000000008',
  '10000000-0000-0000-0000-000000000001',
  '2026-08-24',
  jsonb_build_object(id::text, 60)
from public.projects
where owner_id = '10000000-0000-0000-0000-000000000001' and position = 0;
select throws_ok(
  $$select private.exclude_legacy_daily_close_minutes()$$,
  '22023',
  'LEGACY_DAILY_HISTORY_AMBIGUOUS',
  'A changed child after parent-only history fails safe instead of guessing a project residual'
);
alter table public.daily_close_records enable trigger daily_close_capture_project_minutes;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
insert into public.tasks(
  id, project_id, title, scheduled_date, actual_duration_minutes, completed, status
)
select
  '43000000-0000-0000-0000-000000000005', id,
  'Post repair close trigger task', '2026-08-28', 17, false, 'active'
from public.projects
where owner_id = auth.uid() and position = 0;
select lives_ok(
  $$insert into public.daily_close_records(owner_id, close_date, project_minutes)
    values (auth.uid(), '2026-08-28', '{"forged-project":999999}'::jsonb)$$,
  'New close records still invoke the server-derived trigger after legacy repair'
);
select is(
  (
    select (records.project_minutes ->> projects.id::text)::integer
    from public.daily_close_records as records
    join public.projects on projects.owner_id = records.owner_id and projects.position = 0
    where records.owner_id = auth.uid() and records.close_date = '2026-08-28'
  ),
  17,
  'Re-enabled close trigger derives new records from the task ledger'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select lives_ok(
  $$select public.close_day(
    '2026-08-30',
    '[{"task_id":"41000000-0000-0000-0000-000000000004","action":"abandoned"}]'::jsonb,
    '{"forged-project":999999}'::jsonb
  )$$,
  'Close day can abandon unfinished work atomically'
);
select is(
  (
    select status || ':' || scheduled_date::text || ':' || (postponed_from is null)::text
    from public.tasks
    where id = '41000000-0000-0000-0000-000000000004'
  ),
  'abandoned:2026-08-30:true',
  'Close-day abandonment retains its analytics date without inventing postponement'
);
select is(
  (
    select project_minutes
    from public.daily_close_records
    where owner_id = auth.uid() and close_date = '2026-08-30'
  ),
  (
    select coalesce(jsonb_object_agg(totals.project_id::text, totals.minutes), '{}'::jsonb)
    from (
      select sources.project_id, sum(sources.minutes) as minutes
      from (
        select project_id, minutes::bigint as minutes
        from public.task_time_entries
        where owner_id = auth.uid() and entry_date = '2026-08-30'
      ) as sources
      group by sources.project_id
    ) as totals
  ),
  'Close day ignores forged client totals and stores the server-derived task plus Daily total'
);
select lives_ok(
  $$update public.daily_close_records
    set project_minutes = '{"forged-update":888888}'::jsonb
    where owner_id = auth.uid() and close_date = '2026-08-30'$$,
  'Direct close-record updates remain compatible with the server-derived total trigger'
);
select isnt(
  (
    select project_minutes
    from public.daily_close_records
    where owner_id = auth.uid() and close_date = '2026-08-30'
  ),
  '{"forged-update":888888}'::jsonb,
  'Direct close-record updates cannot persist a forged project total'
);
select lives_ok(
  $$insert into public.daily_close_records(owner_id, close_date, project_minutes)
    values (auth.uid(), '2099-01-01', '{"forged-empty-day":1}'::jsonb)$$,
  'A close record can be inserted for a date with no work'
);
select is(
  (
    select project_minutes
    from public.daily_close_records
    where owner_id = auth.uid() and close_date = '2099-01-01'
  ),
  '{}'::jsonb,
  'A date with no task or Daily work stores an empty server-derived total'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
select is((select count(*) from public.projects), 1::bigint, 'RLS exposes only the current account project');
select is((select count(*) from public.daily_entries), 0::bigint, 'RLS hides another account Daily entries');
select is((select count(*) from public.rhythm_marks), 0::bigint, 'RLS hides another account Rhythm');

select * from finish();
rollback;
