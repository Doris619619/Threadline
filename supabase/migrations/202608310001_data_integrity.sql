-- 文件用途：补齐任务实际投入、完成历史与 Daily 复合写入的数据库级完整性约束。

create table if not exists public.task_time_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid,
  entry_date date not null,
  project_id uuid not null,
  minutes integer not null check (minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, task_id, entry_date),
  constraint task_time_entries_owner_task_fkey
    foreign key (owner_id, task_id)
    references public.tasks(owner_id, id)
    on delete set null (task_id),
  constraint task_time_entries_owner_project_fkey
    foreign key (owner_id, project_id)
    references public.projects(owner_id, id)
    on delete no action
);

create index if not exists task_time_entries_owner_date_idx
  on public.task_time_entries(owner_id, entry_date, project_id);

alter table public.task_time_entries enable row level security;
create policy "users read their task time entries" on public.task_time_entries
  for select using (owner_id = auth.uid());

-- migration 事务内阻止 tasks 并发写穿过“回填到安装 trigger”窗口，提交后立即恢复普通写入。
lock table public.tasks in share row exclusive mode;

-- 旧 aggregate 只在可确定的原计划日期回填；没有日期的记录保留为不可精确归因。
insert into public.task_time_entries(owner_id, task_id, entry_date, project_id, minutes)
select owner_id, id, scheduled_date, project_id, actual_duration_minutes
from public.tasks
where scheduled_date is not null and coalesce(actual_duration_minutes, 0) > 0
on conflict (owner_id, task_id, entry_date) do nothing;

-- 将 aggregate 的增量固定到写入发生时的业务日；移期本身绝不移动既有 entry。
create or replace function public.capture_task_actual_time()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  previous_minutes integer := coalesce(old.actual_duration_minutes, 0);
  next_minutes integer := coalesce(new.actual_duration_minutes, 0);
  delta integer;
begin
  if tg_op = 'INSERT' then
    delta := next_minutes;
  else
    delta := next_minutes - previous_minutes;
  end if;
  if delta = 0 then return new; end if;
  if new.scheduled_date is null then
    raise exception 'TASK_ACTUAL_DATE_REQUIRED' using errcode = '22023';
  end if;

  if delta < 0 then
    update public.task_time_entries as entries
    set minutes = entries.minutes + delta,
        updated_at = now()
    where entries.owner_id = new.owner_id
      and entries.task_id = new.id
      and entries.entry_date = new.scheduled_date
      and entries.minutes + delta >= 0;
    if not found then
      raise exception 'TASK_ACTUAL_BELOW_FIXED_HISTORY' using errcode = '22023';
    end if;
    return new;
  end if;

  insert into public.task_time_entries(owner_id, task_id, entry_date, project_id, minutes)
  values (new.owner_id, new.id, new.scheduled_date, new.project_id, delta)
  on conflict (owner_id, task_id, entry_date) do update
    set minutes = task_time_entries.minutes + delta,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_capture_actual_time on public.tasks;
create trigger tasks_capture_actual_time
after insert or update of actual_duration_minutes on public.tasks
for each row execute function public.capture_task_actual_time();

-- 完成状态是正式业务事件；由触发器与任务更新同一事务提交，禁止客户端双写。
create or replace function public.append_task_completion_history()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if old.completed is not distinct from new.completed then return new; end if;
  insert into public.history_events(
    id, owner_id, task_id, event_type, occurred_at, payload,
    task_title_snapshot, project_id_snapshot, task_date_snapshot
  ) values (
    gen_random_uuid(), new.owner_id, new.id,
    case when new.completed then 'completed' else 'reopened' end,
    coalesce(new.completed_at, now()),
    jsonb_build_object('completed', new.completed),
    new.title, new.project_id, new.scheduled_date
  );
  return new;
end;
$$;

drop trigger if exists tasks_append_completion_history on public.tasks;
create trigger tasks_append_completion_history
after update of completed on public.tasks
for each row execute function public.append_task_completion_history();

-- 原子替换某一日期 Daily 的父字段和所有子项，任何 item 非法都会回滚父更新。
create or replace function public.save_daily_entry_bundle(
  p_entry_id uuid,
  p_project_id uuid,
  p_title text,
  p_completed boolean,
  p_actual_duration_minutes integer,
  p_result text,
  p_items jsonb
)
returns public.daily_entries
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_owner uuid := auth.uid();
  saved public.daily_entries;
  selected_project public.projects;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if char_length(trim(p_title)) not between 1 and 200 then raise exception 'INVALID_DAILY_TITLE' using errcode = '22023'; end if;
  if coalesce(p_actual_duration_minutes, 0) < 0 then raise exception 'INVALID_DAILY_ACTUAL' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'INVALID_DAILY_ITEMS' using errcode = '22023'; end if;
  select projects.* into selected_project
  from public.projects as projects
  where projects.id = p_project_id
    and projects.owner_id = current_owner
    and projects.status = 'active';
  if selected_project.id is null then
    raise exception 'ACTIVE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(id uuid, title text, actual integer) where char_length(trim(coalesce(i.title, ''))) not between 1 and 200 or coalesce(i.actual, 0) < 0) then
    raise exception 'INVALID_DAILY_ITEM' using errcode = '22023';
  end if;

  update public.daily_entries
  set project_id = p_project_id,
      project_name_snapshot = selected_project.name,
      color_snapshot = selected_project.color,
      title_snapshot = trim(p_title), completed = p_completed,
      actual_duration_minutes = coalesce(p_actual_duration_minutes, 0), result = coalesce(p_result, '')
  where id = p_entry_id and owner_id = current_owner
  returning * into saved;
  if saved.id is null then raise exception 'DAILY_ENTRY_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as supplied(id uuid)
    join public.daily_entry_items as existing on existing.id = supplied.id
    where supplied.id is not null
      and (existing.owner_id <> current_owner or existing.entry_id <> p_entry_id)
  ) then
    raise exception 'DAILY_ENTRY_ITEM_SCOPE_MISMATCH' using errcode = '22023';
  end if;

  delete from public.daily_entry_items
  where entry_id = p_entry_id and owner_id = current_owner
    and id not in (select id from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(id uuid) where i.id is not null);
  insert into public.daily_entry_items(id, owner_id, entry_id, template_item_id, title_snapshot, position, completed, actual_duration_minutes)
  select coalesce(i.id, gen_random_uuid()), current_owner, p_entry_id, i.template_item_id,
         trim(i.title), i.position, coalesce(i.completed, false), coalesce(i.actual, 0)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as i(id uuid, template_item_id uuid, title text, position integer, completed boolean, actual integer)
  on conflict (id) do update set title_snapshot = excluded.title_snapshot, position = excluded.position,
    completed = excluded.completed, actual_duration_minutes = excluded.actual_duration_minutes;
  return saved;
end;
$$;

-- 编辑 Daily 在同一事务更新长期模板和当前 entry；其他已生成日期保持 snapshot 不变。
create or replace function public.update_daily_template_bundle(
  p_template_id uuid,
  p_entry_id uuid,
  p_project_id uuid,
  p_title text,
  p_template_items jsonb,
  p_entry_items jsonb
)
returns public.daily_templates
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_owner uuid := auth.uid();
  saved public.daily_templates;
  current_entry public.daily_entries;
  selected_project public.projects;
  resolved_items jsonb;
  position_offset integer;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if char_length(trim(p_title)) not between 1 and 200 then raise exception 'INVALID_DAILY_TITLE' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_template_items, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_entry_items, '[]'::jsonb)) <> 'array'
  then raise exception 'INVALID_DAILY_ITEMS' using errcode = '22023'; end if;

  select projects.* into selected_project
  from public.projects as projects
  where projects.id = p_project_id
    and projects.owner_id = current_owner
    and projects.status = 'active';
  if selected_project.id is null then raise exception 'ACTIVE_PROJECT_NOT_FOUND' using errcode = 'P0002'; end if;

  select templates.* into saved
  from public.daily_templates as templates
  where templates.id = p_template_id and templates.owner_id = current_owner
  for update;
  if saved.id is null then raise exception 'DAILY_TEMPLATE_NOT_FOUND' using errcode = 'P0002'; end if;

  select entries.* into current_entry
  from public.daily_entries as entries
  where entries.id = p_entry_id
    and entries.owner_id = current_owner
    and entries.template_id = p_template_id
  for update;
  if current_entry.id is null then raise exception 'DAILY_ENTRY_NOT_FOUND' using errcode = 'P0002'; end if;

  perform items.id
  from public.daily_entry_items as items
  where items.owner_id = current_owner and items.entry_id = p_entry_id
  order by items.id
  for update;
  perform items.id
  from public.daily_template_items as items
  where items.owner_id = current_owner and items.template_id = p_template_id
  order by items.id
  for update;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_template_items, '[]'::jsonb))
      as i(id uuid, title text, position integer)
    where i.id is null
      or char_length(trim(coalesce(i.title, ''))) not between 1 and 200
      or coalesce(i.position, -1) < 0
  ) then raise exception 'INVALID_DAILY_ITEM' using errcode = '22023'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_entry_items, '[]'::jsonb))
      as i(id uuid, template_item_id uuid, title text, position integer, actual integer)
    where i.id is null
      or i.template_item_id is null
      or char_length(trim(coalesce(i.title, ''))) not between 1 and 200
      or coalesce(i.position, -1) < 0
      or coalesce(i.actual, 0) < 0
  ) then raise exception 'INVALID_DAILY_ITEM' using errcode = '22023'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_entry_items, '[]'::jsonb))
      as entry_item(id uuid, template_item_id uuid)
    full join jsonb_to_recordset(coalesce(p_template_items, '[]'::jsonb))
      as template_item(id uuid)
      on template_item.id = entry_item.template_item_id
    where entry_item.template_item_id is null or template_item.id is null
  ) then raise exception 'DAILY_ITEM_MAPPING_MISMATCH' using errcode = '22023'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_template_items, '[]'::jsonb)) as supplied(id uuid)
    join public.daily_template_items as existing on existing.id = supplied.id
    where supplied.id is not null
      and (existing.owner_id <> current_owner or existing.template_id <> p_template_id)
  ) then
    raise exception 'DAILY_TEMPLATE_ITEM_SCOPE_MISMATCH' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_entry_items, '[]'::jsonb)) as supplied(id uuid)
    join public.daily_entry_items as existing on existing.id = supplied.id
    where supplied.id is not null
      and (existing.owner_id <> current_owner or existing.entry_id <> p_entry_id)
  ) then
    raise exception 'DAILY_ENTRY_ITEM_SCOPE_MISMATCH' using errcode = '22023';
  end if;

  -- payload 内的结构字段可更新；已存在 child 的 completed/actual 始终以锁定后的服务端值为准。
  -- payload 缺失的并发 child 追加到结构末尾，不得解释为删除。
  with supplied as (
    select i.*
    from jsonb_to_recordset(coalesce(p_entry_items, '[]'::jsonb))
      as i(id uuid, template_item_id uuid, title text, position integer, completed boolean, actual integer)
  ), merged as (
    select
      coalesce(existing.id, supplied.id) as entry_item_id,
      coalesce(existing.template_item_id, supplied.template_item_id, existing.id) as template_item_id,
      case when supplied.id is null then existing.title_snapshot else trim(supplied.title) end as title,
      case when existing.id is null then coalesce(supplied.completed, false) else existing.completed end as completed,
      case when existing.id is null then coalesce(supplied.actual, 0) else existing.actual_duration_minutes end as actual,
      case when supplied.id is null then 1 else 0 end as missing_from_payload,
      coalesce(supplied.position, existing.position) as requested_position
    from public.daily_entry_items as existing
    full join supplied on supplied.id = existing.id
    where (existing.id is null or (existing.owner_id = current_owner and existing.entry_id = p_entry_id))
  ), ordered as (
    select merged.*,
      row_number() over (
        order by merged.missing_from_payload, merged.requested_position, merged.entry_item_id
      ) - 1 as resolved_position
    from merged
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'entry_item_id', ordered.entry_item_id,
        'template_item_id', ordered.template_item_id,
        'title', ordered.title,
        'position', ordered.resolved_position,
        'completed', ordered.completed,
        'actual', ordered.actual
      ) order by ordered.resolved_position
    ),
    '[]'::jsonb
  ) into resolved_items
  from ordered;

  if exists (
    select 1
    from jsonb_to_recordset(resolved_items) as supplied(template_item_id uuid)
    join public.daily_template_items as existing on existing.id = supplied.template_item_id
    where existing.owner_id <> current_owner or existing.template_id <> p_template_id
  ) then
    raise exception 'DAILY_TEMPLATE_ITEM_SCOPE_MISMATCH' using errcode = '22023';
  end if;

  update public.daily_templates
  set project_id = p_project_id, title = trim(p_title)
  where id = p_template_id and owner_id = current_owner
  returning * into saved;

  insert into public.daily_template_items(id, owner_id, template_id, title, position)
  select i.template_item_id, current_owner, p_template_id, trim(i.title), i.position
  from jsonb_to_recordset(resolved_items)
    as i(entry_item_id uuid, template_item_id uuid, title text, position integer, completed boolean, actual integer)
  on conflict (id) do update set title = excluded.title, position = excluded.position;
  delete from public.daily_template_items
  where template_id = p_template_id and owner_id = current_owner
    and id not in (
      select i.template_item_id
      from jsonb_to_recordset(resolved_items) as i(template_item_id uuid)
    );

  update public.daily_entries
  set project_id = p_project_id,
      project_name_snapshot = selected_project.name,
      color_snapshot = selected_project.color,
      title_snapshot = trim(p_title)
  where id = p_entry_id and owner_id = current_owner;

  select coalesce(max(items.position), 0) + jsonb_array_length(resolved_items) + 1
  into position_offset
  from public.daily_entry_items as items
  where items.owner_id = current_owner and items.entry_id = p_entry_id;
  update public.daily_entry_items as items
  set position = items.position + position_offset
  where items.owner_id = current_owner and items.entry_id = p_entry_id;
  insert into public.daily_entry_items(
    id, owner_id, entry_id, template_item_id, title_snapshot,
    position, completed, actual_duration_minutes
  )
  select i.entry_item_id, current_owner, p_entry_id, i.template_item_id,
    trim(i.title), i.position, i.completed, i.actual
  from jsonb_to_recordset(resolved_items)
    as i(entry_item_id uuid, template_item_id uuid, title text, position integer, completed boolean, actual integer)
  on conflict (id) do update
    set template_item_id = excluded.template_item_id,
        title_snapshot = excluded.title_snapshot,
        position = excluded.position;
  return saved;
end;
$$;

-- Daily 统计口径是父级 actual 加所有 child actual；history 与 close-day 复用同一数据库表达式。
create or replace function public.daily_entry_total_actual(p_entry_id uuid)
returns integer language sql stable security invoker set search_path = pg_catalog, public as $$
  select coalesce((select actual_duration_minutes from public.daily_entries where id = p_entry_id), 0)
    + coalesce((select sum(actual_duration_minutes) from public.daily_entry_items where entry_id = p_entry_id), 0);
$$;

-- 关账汇总不信任客户端参数；每次写入都从保留的任务账本与 Daily 父子项重新按项目聚合。
create or replace function public.capture_daily_close_project_minutes()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  select coalesce(jsonb_object_agg(totals.project_id::text, totals.minutes), '{}'::jsonb)
  into new.project_minutes
  from (
    select sources.project_id, sum(sources.minutes) as minutes
    from (
      select entries.project_id, entries.minutes::bigint as minutes
      from public.task_time_entries as entries
      where entries.owner_id = new.owner_id
        and entries.entry_date = new.close_date
      union all
      select entries.project_id, public.daily_entry_total_actual(entries.id)::bigint as minutes
      from public.daily_entries as entries
      where entries.owner_id = new.owner_id
        and entries.entry_date = new.close_date
    ) as sources
    group by sources.project_id
  ) as totals;
  return new;
end;
$$;

drop trigger if exists daily_close_capture_project_minutes on public.daily_close_records;
create trigger daily_close_capture_project_minutes
before insert or update on public.daily_close_records
for each row execute function public.capture_daily_close_project_minutes();

-- 所有 Daily history 写入（手动记录或 close-day）都捕获同一份父加子项总实际。
create or replace function public.capture_daily_history_total()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.actual_duration_minutes := public.daily_entry_total_actual(new.entry_id);
  return new;
end;
$$;

drop trigger if exists daily_history_capture_total on public.daily_history_entries;
create trigger daily_history_capture_total
before insert on public.daily_history_entries
for each row execute function public.capture_daily_history_total();

create or replace function public.record_daily_history(
  p_template_id uuid, p_entry_date date, p_record_source text default 'manual'
)
returns public.daily_history_entries language plpgsql security invoker set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); recorded public.daily_history_entries;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_record_source not in ('manual', 'close_day') then raise exception 'INVALID_RECORD_SOURCE' using errcode = '22023'; end if;
  insert into public.daily_history_entries(owner_id, template_id, entry_id, entry_date, project_id, title_snapshot, project_name_snapshot, color_snapshot, completed, actual_duration_minutes, result, record_source)
  select entries.owner_id, entries.template_id, entries.id, entries.entry_date, entries.project_id, entries.title_snapshot, entries.project_name_snapshot, entries.color_snapshot, entries.completed, public.daily_entry_total_actual(entries.id), coalesce(entries.result, ''), p_record_source
  from public.daily_entries entries where entries.owner_id = current_owner and entries.template_id = p_template_id and entries.entry_date = p_entry_date
  on conflict (owner_id, template_id, entry_date) do nothing returning * into recorded;
  if recorded.id is null then select history.* into recorded from public.daily_history_entries history where history.owner_id = current_owner and history.template_id = p_template_id and history.entry_date = p_entry_date; end if;
  if recorded.id is null then raise exception 'DAILY_ENTRY_NOT_FOUND' using errcode = 'P0002'; end if;
  return recorded;
end;
$$;

revoke all privileges on table public.task_time_entries from public, anon, authenticated;
grant select on table public.task_time_entries to authenticated;
revoke all on function public.capture_task_actual_time() from public, anon, authenticated;
revoke all on function public.save_daily_entry_bundle(uuid, uuid, text, boolean, integer, text, jsonb) from public, anon;
revoke all on function public.update_daily_template_bundle(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.daily_entry_total_actual(uuid) from public, anon, authenticated;
revoke all on function public.capture_daily_close_project_minutes() from public, anon, authenticated;
grant update, delete on public.daily_template_items to authenticated;
grant update on public.daily_templates to authenticated;
grant delete on public.daily_entry_items to authenticated;
grant execute on function public.save_daily_entry_bundle(uuid, uuid, text, boolean, integer, text, jsonb) to authenticated;
grant execute on function public.update_daily_template_bundle(uuid, uuid, uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.daily_entry_total_actual(uuid) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_time_entries') then
    alter publication supabase_realtime add table public.task_time_entries;
  end if;
end $$;
