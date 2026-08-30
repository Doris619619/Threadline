-- 文件用途：用 pgTAP 验证 Threadline RLS、Daily、工作站、回收站与权限边界。

begin;
create extension if not exists pgtap with schema extensions;
select plan(88);

select has_table('public', 'daily_history_entries', 'Daily history has an explicit table');
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
  'public', 'task_time_entries', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'Authenticated analytics can read owner-scoped task time entries'
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
      'workspace_profiles', 'projects', 'tasks', 'daily_templates',
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
  'public', 'create_daily_template_with_entry', array['uuid', 'uuid', 'text', 'date'],
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
  'public', 'save_daily_entry_bundle', array['uuid', 'uuid', 'text', 'boolean', 'integer', 'text', 'jsonb'],
  'authenticated', array['EXECUTE'], 'Authenticated can atomically save a Daily entry bundle'
);
select function_privs_are(
  'public', 'update_daily_template_bundle', array['uuid', 'uuid', 'text', 'jsonb'],
  'authenticated', array['EXECUTE'], 'Authenticated can atomically update a Daily template'
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
  'public', 'create_daily_template_with_entry', array['uuid', 'uuid', 'text', 'date'],
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
  'public', 'save_daily_entry_bundle', array['uuid', 'uuid', 'text', 'boolean', 'integer', 'text', 'jsonb'],
  'anon', array[]::text[], 'Anonymous clients cannot save a Daily entry bundle'
);
select function_privs_are(
  'public', 'update_daily_template_bundle', array['uuid', 'uuid', 'text', 'jsonb'],
  'anon', array[]::text[], 'Anonymous clients cannot update a Daily template'
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

insert into public.tasks(id, project_id, title, scheduled_date, completed, status)
select
  values_to_insert.id,
  projects.id,
  values_to_insert.title,
  '2026-08-30',
  false,
  'active'
from public.projects as projects
cross join (values
  ('40000000-0000-0000-0000-000000000004'::uuid, 'Task A'),
  ('41000000-0000-0000-0000-000000000004'::uuid, 'Task B')
) as values_to_insert(id, title)
where projects.owner_id = auth.uid() and projects.position = 0;

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
    '{}'::jsonb
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
