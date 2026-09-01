-- 文件用途：用 pgTAP 验证 Threadline RLS、任务投入账本、Daily、工作站、回收站与权限边界。

begin;
create extension if not exists pgtap with schema extensions;
select plan(118);

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
  'public', 'daily_templates', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
  'Authenticated Daily commands can read, create, and update templates'
);
select table_privs_are(
  'public', 'daily_template_items', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'Authenticated Daily flow can atomically replace template items'
);
select table_privs_are(
  'public', 'daily_entries', 'authenticated', array['SELECT', 'INSERT', 'UPDATE'],
  'Authenticated Daily flow can materialize and edit date entries'
);
select table_privs_are(
  'public', 'daily_entry_items', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'Authenticated Daily flow can atomically replace date items'
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
  $$insert into public.tasks(id, project_id, title, completed, status)
    values (
      '22000000-0000-0000-0000-000000000002',
      '21000000-0000-0000-0000-000000000002',
      'Cross-owner task', false, 'active'
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
  1::bigint,
  'Date-only child does not pollute future instances'
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
  null,
  100,
  false,
  'active'
from public.projects as projects
where projects.owner_id = '10000000-0000-0000-0000-000000000001'
  and projects.position = 0;
alter table public.tasks enable trigger tasks_capture_actual_time;
update public.tasks
set scheduled_date = '2026-09-03'
where id = '42000000-0000-0000-0000-000000000004';

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
  '2026-08-30'::date,
  'Direct trash preserves the original business date in postponed_from'
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

-- 模拟 20260901 前已落库的 close：raw 项目分钟 = task 40 + Daily exact 60。
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
insert into public.tasks(
  id, project_id, title, scheduled_date, actual_duration_minutes, completed, status
)
select
  '43000000-0000-0000-0000-000000000004', id,
  'Legacy close task residual', '2026-08-29', 40, false, 'active'
from public.projects
where owner_id = auth.uid() and position = 0;

reset role;
alter table public.daily_close_records disable trigger daily_close_capture_project_minutes;
insert into public.daily_close_records(id, owner_id, close_date, project_minutes)
select
  '44000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  '2026-08-29',
  jsonb_build_object(id::text, 100)
from public.projects
where owner_id = '10000000-0000-0000-0000-000000000001' and position = 0;
alter table public.daily_close_records enable trigger daily_close_capture_project_minutes;
select is(
  private.exclude_legacy_daily_close_minutes(),
  1,
  'Legacy close repair removes exactly one independently recorded Daily allocation'
);
select is(
  (
    select (records.project_minutes ->> projects.id::text)::integer
    from public.daily_close_records as records
    join public.projects on projects.owner_id = records.owner_id and projects.position = 0
    where records.id = '44000000-0000-0000-0000-000000000004'
  ),
  40,
  'Legacy close keeps the task residual and does not reassign Daily to project analytics'
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
