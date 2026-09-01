-- 文件用途：将项目安全删除与 Daily 模板管理迁移为独立、可审计的 Supabase 业务命令。

-- 项目删除保留历史 project identity；所有当前 task（包括回收站）都会改派到 fallback。
alter table public.projects add column if not exists deleted_at timestamptz;
create index if not exists projects_owner_visible_idx
  on public.projects(owner_id, position) where deleted_at is null;

-- Daily 模板与实例保留旧项目快照，但新业务模型完全不再要求项目归属。
alter table public.daily_templates
  add column if not exists legacy_project_id uuid,
  add column if not exists deleted_at timestamptz;
update public.daily_templates set legacy_project_id = project_id
where legacy_project_id is null and project_id is not null;
alter table public.daily_templates alter column project_id drop not null;
update public.daily_templates set project_id = null where project_id is not null;

alter table public.daily_entries
  add column if not exists legacy_project_id uuid;
update public.daily_entries set legacy_project_id = project_id
where legacy_project_id is null and project_id is not null;
alter table public.daily_entries alter column project_id drop not null;
update public.daily_entries set project_id = null where project_id is not null;

alter table public.daily_history_entries
  add column if not exists legacy_project_id uuid;
update public.daily_history_entries set legacy_project_id = project_id
where legacy_project_id is null and project_id is not null;
alter table public.daily_history_entries alter column project_id drop not null;
update public.daily_history_entries set project_id = null where project_id is not null;

alter table public.daily_template_items
  add column if not exists planned_duration_minutes integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add constraint daily_template_items_planned_nonnegative
    check (planned_duration_minutes >= 0) not valid;
alter table public.daily_template_items
  validate constraint daily_template_items_planned_nonnegative;
alter table public.daily_entry_items
  add column if not exists planned_duration_minutes_snapshot integer not null default 0,
  add constraint daily_entry_items_planned_nonnegative
    check (planned_duration_minutes_snapshot >= 0) not valid;
alter table public.daily_entry_items
  validate constraint daily_entry_items_planned_nonnegative;

-- 不允许直接用通用 upsert 破坏 fallback 或删除语义。
create or replace function public.update_project_details(
  p_project_id uuid, p_name text, p_color text
) returns public.projects language plpgsql security invoker
set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); saved public.projects;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if char_length(trim(p_name)) not between 1 and 80
    or p_color !~ '^#[0-9A-Fa-f]{6}$'
  then raise exception 'INVALID_PROJECT_DETAILS' using errcode = '22023'; end if;
  update public.projects set name = trim(p_name), color = p_color
  where id = p_project_id and owner_id = current_owner and deleted_at is null
  returning * into saved;
  if saved.id is null then raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002'; end if;
  return saved;
end; $$;

create or replace function public.set_project_archived(
  p_project_id uuid, p_archived boolean
) returns public.projects language plpgsql security invoker
set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); saved public.projects;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  update public.projects
  set status = case when p_archived then 'archived' else 'active' end,
      archived_at = case when p_archived then now() else null end
  where id = p_project_id and owner_id = current_owner and deleted_at is null
    and not is_fallback
  returning * into saved;
  if saved.id is null then raise exception 'PROJECT_ARCHIVE_FORBIDDEN' using errcode = '22023'; end if;
  return saved;
end; $$;

create or replace function public.soft_delete_project(p_project_id uuid)
returns public.projects language plpgsql security invoker
set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); target public.projects; fallback public.projects;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select * into target from public.projects
  where id = p_project_id and owner_id = current_owner and deleted_at is null for update;
  if target.id is null or target.is_fallback then
    raise exception 'PROJECT_DELETE_FORBIDDEN' using errcode = '22023';
  end if;
  select * into fallback from public.projects
  where owner_id = current_owner and is_fallback and status = 'active' and deleted_at is null
  for update;
  if fallback.id is null then raise exception 'FALLBACK_PROJECT_NOT_FOUND' using errcode = 'P0002'; end if;
  update public.tasks set project_id = fallback.id
  where owner_id = current_owner and project_id = target.id;
  update public.projects set deleted_at = now(), status = 'archived', archived_at = now()
  where id = target.id and owner_id = current_owner
  returning * into target;
  return target;
end; $$;

-- 未来 Daily entry 仅从 active 且未删除的模板/清单项实例化；以固定路径的 owner-scoped definer 写入，历史 entry 永不改写。
create or replace function public.ensure_daily_entries_for_date(p_entry_date date)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); result jsonb;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  with inserted_entries as (
    insert into public.daily_entries(
    id, owner_id, template_id, entry_date, project_id, title_snapshot,
    project_name_snapshot, color_snapshot, completed, actual_duration_minutes, result
    )
    select gen_random_uuid(), templates.owner_id, templates.id, p_entry_date, null,
      templates.title, 'Daily', '#8A8A8A', false, 0, ''
    from public.daily_templates templates
    where templates.owner_id = current_owner and templates.is_active
      and templates.deleted_at is null
    on conflict (owner_id, template_id, entry_date) do nothing
    returning id, owner_id, template_id
  )
  insert into public.daily_entry_items(
      id, owner_id, entry_id, template_item_id, title_snapshot, position,
      completed, actual_duration_minutes, planned_duration_minutes_snapshot
    )
  select gen_random_uuid(), entries.owner_id, entries.id, items.id, items.title,
    items.position, false, 0, items.planned_duration_minutes
  from inserted_entries entries
  join public.daily_template_items items
    on items.owner_id = entries.owner_id and items.template_id = entries.template_id
  where items.is_active and items.deleted_at is null;
  select jsonb_build_object(
    'entries', coalesce(jsonb_agg(to_jsonb(entries) order by templates.position), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(items) order by items.entry_id, items.position)
      from public.daily_entry_items items join public.daily_entries entry_items
        on entry_items.owner_id = items.owner_id and entry_items.id = items.entry_id
      where items.owner_id = current_owner and entry_items.entry_date = p_entry_date), '[]'::jsonb)
  ) into result
  from public.daily_entries entries join public.daily_templates templates
    on templates.owner_id = entries.owner_id and templates.id = entries.template_id
  where entries.owner_id = current_owner and entries.entry_date = p_entry_date;
  return coalesce(result, jsonb_build_object('entries', '[]'::jsonb, 'items', '[]'::jsonb));
end; $$;

-- 创建 Daily 与所有清单项在同一事务完成，固定路径的 owner-scoped definer 避免客户端直接表写绕过生命周期。
drop function if exists public.create_daily_template_with_entry(uuid, uuid, text, date);
create function public.create_daily_template_with_entry(
  p_template_id uuid, p_title text, p_items jsonb, p_entry_date date
) returns public.daily_templates language plpgsql security definer
set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); saved public.daily_templates; next_position integer;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if char_length(trim(p_title)) not between 1 and 200
    or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
    or exists (select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
      as i(title text, planned_duration_minutes integer)
      where char_length(trim(coalesce(i.title, ''))) not between 1 and 200
        or coalesce(i.planned_duration_minutes, 0) < 0)
  then raise exception 'INVALID_DAILY_TEMPLATE' using errcode = '22023'; end if;
  select coalesce(max(position), -1) + 1 into next_position
  from public.daily_templates where owner_id = current_owner;
  insert into public.daily_templates(id, owner_id, project_id, title, is_active, position)
  values (p_template_id, current_owner, null, trim(p_title), true, next_position)
  returning * into saved;
  insert into public.daily_template_items(
    id, owner_id, template_id, title, position, planned_duration_minutes
  ) select coalesce(i.id, gen_random_uuid()), current_owner, saved.id,
    trim(i.title), i.position, coalesce(i.planned_duration_minutes, 0)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as i(id uuid, title text, position integer, planned_duration_minutes integer);
  perform public.ensure_daily_entries_for_date(p_entry_date);
  return saved;
end; $$;

-- 模板编辑只影响将来日期；固定路径的 owner-scoped definer 仅允许 RPC 改写模板，不改写既有 entry/history snapshot。
drop function if exists public.update_daily_template_bundle(uuid, uuid, uuid, text, jsonb, jsonb);
create or replace function public.update_daily_template_bundle(
  p_template_id uuid, p_title text, p_items jsonb
) returns public.daily_templates language plpgsql security definer
set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); saved public.daily_templates;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if char_length(trim(p_title)) not between 1 and 200
    or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
    or exists (select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
      as i(id uuid, title text, position integer, planned_duration_minutes integer)
      where i.id is null or char_length(trim(coalesce(i.title, ''))) not between 1 and 200
        or coalesce(i.position, -1) < 0 or coalesce(i.planned_duration_minutes, 0) < 0)
  then raise exception 'INVALID_DAILY_TEMPLATE' using errcode = '22023'; end if;
  update public.daily_templates set title = trim(p_title)
  where id = p_template_id and owner_id = current_owner and deleted_at is null
  returning * into saved;
  if saved.id is null then raise exception 'DAILY_TEMPLATE_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(id uuid)
    join public.daily_template_items existing on existing.id = i.id
    where existing.owner_id <> current_owner or existing.template_id <> p_template_id)
  then raise exception 'DAILY_TEMPLATE_ITEM_SCOPE_MISMATCH' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(id uuid)
    join public.daily_template_items existing on existing.id = i.id
    where existing.owner_id = current_owner and existing.template_id = p_template_id
      and existing.deleted_at is not null)
  then raise exception 'DELETED_DAILY_TEMPLATE_ITEM_UPDATE_FORBIDDEN' using errcode = '22023'; end if;
  if not saved.is_active and exists (
    select 1
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(id uuid)
    left join public.daily_template_items existing
      on existing.id = i.id and existing.owner_id = current_owner
        and existing.template_id = p_template_id
    where existing.id is null
  )
  then raise exception 'ARCHIVED_DAILY_ITEM_APPEND_FORBIDDEN' using errcode = '22023'; end if;
  update public.daily_template_items set deleted_at = now(), is_active = false
  where owner_id = current_owner and template_id = p_template_id and deleted_at is null
    and id not in (select id from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(id uuid));
  insert into public.daily_template_items(
    id, owner_id, template_id, title, position, planned_duration_minutes, is_active, archived_at, deleted_at
  ) select i.id, current_owner, p_template_id, trim(i.title), i.position,
    coalesce(i.planned_duration_minutes, 0), true, null, null
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as i(id uuid, title text, position integer, planned_duration_minutes integer)
  on conflict (id) do update set title = excluded.title, position = excluded.position,
    planned_duration_minutes = excluded.planned_duration_minutes;
  return saved;
end; $$;

-- 首页 Daily 执行仍可经固定路径的 owner-scoped definer 原子保存父级实际/结果与子项实际，但不能再写入项目字段。
drop function if exists public.save_daily_entry_bundle(uuid, uuid, text, boolean, integer, text, jsonb);
create function public.save_daily_entry_bundle(
  p_entry_id uuid, p_title text, p_completed boolean, p_actual_duration_minutes integer,
  p_result text, p_items jsonb
) returns public.daily_entries language plpgsql security definer
set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); saved public.daily_entries;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if char_length(trim(p_title)) not between 1 and 200
    or coalesce(p_actual_duration_minutes, 0) < 0
    or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
    or exists (select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
      as i(id uuid, title text, actual integer)
      where char_length(trim(coalesce(i.title, ''))) not between 1 and 200 or coalesce(i.actual, 0) < 0)
  then raise exception 'INVALID_DAILY_ENTRY' using errcode = '22023'; end if;
  update public.daily_entries set title_snapshot = trim(p_title), completed = p_completed,
    actual_duration_minutes = coalesce(p_actual_duration_minutes, 0), result = coalesce(p_result, '')
  where id = p_entry_id and owner_id = current_owner returning * into saved;
  if saved.id is null then raise exception 'DAILY_ENTRY_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(id uuid)
    join public.daily_entry_items existing on existing.id = i.id
    where existing.owner_id <> current_owner or existing.entry_id <> p_entry_id)
  then raise exception 'DAILY_ENTRY_ITEM_SCOPE_MISMATCH' using errcode = '22023'; end if;
  update public.daily_entry_items set title_snapshot = trim(i.title), completed = coalesce(i.completed, false),
    actual_duration_minutes = coalesce(i.actual, 0)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as i(id uuid, title text, completed boolean, actual integer)
  where daily_entry_items.id = i.id and daily_entry_items.owner_id = current_owner
    and daily_entry_items.entry_id = p_entry_id;
  return saved;
end; $$;

-- 以固定路径的 owner-scoped definer 执行模板生命周期；已删除行永远不可被 restore 或 archive。
create or replace function public.set_daily_template_status(
  p_template_id uuid, p_status text
) returns public.daily_templates language plpgsql security definer
set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); saved public.daily_templates;
begin
  if current_owner is null or p_status not in ('archive', 'restore', 'delete')
  then raise exception 'INVALID_DAILY_TEMPLATE_STATUS' using errcode = '22023'; end if;
  update public.daily_templates set
    is_active = case when p_status = 'restore' then true else false end,
    deleted_at = case when p_status = 'delete' then now() else deleted_at end
  where id = p_template_id and owner_id = current_owner and deleted_at is null
  returning * into saved;
  if saved.id is null then raise exception 'DAILY_TEMPLATE_NOT_FOUND' using errcode = 'P0002'; end if;
  return saved;
end; $$;

-- 以固定路径的 owner-scoped definer 执行清单项生命周期；已删除项永远不可被 restore 或 update。
create or replace function public.set_daily_template_item_status(
  p_template_item_id uuid, p_status text
) returns public.daily_template_items language plpgsql security definer
set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); saved public.daily_template_items;
begin
  if current_owner is null or p_status not in ('archive', 'restore', 'delete')
  then raise exception 'INVALID_DAILY_ITEM_STATUS' using errcode = '22023'; end if;
  update public.daily_template_items set
    is_active = case when p_status = 'restore' then true else false end,
    archived_at = case when p_status = 'archive' then now() when p_status = 'restore' then null else archived_at end,
    deleted_at = case when p_status = 'delete' then now() else deleted_at end
  where id = p_template_item_id and owner_id = current_owner and deleted_at is null
  returning * into saved;
  if saved.id is null then raise exception 'DAILY_TEMPLATE_ITEM_NOT_FOUND' using errcode = 'P0002'; end if;
  return saved;
end; $$;

-- Daily 没有项目归属；关账项目聚合只合并普通任务账本。
create or replace function public.capture_daily_close_project_minutes()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  select coalesce(jsonb_object_agg(entries.project_id::text, entries.minutes), '{}'::jsonb)
  into new.project_minutes
  from (select project_id, sum(minutes)::bigint as minutes
    from public.task_time_entries where owner_id = new.owner_id and entry_date = new.close_date
    group by project_id) entries;
  return new;
end; $$;

-- 按模板管理状态补充最小权限，所有复合写入只能通过 owner-scoped RPC。
revoke all on function public.update_project_details(uuid, text, text), public.set_project_archived(uuid, boolean),
  public.soft_delete_project(uuid), public.create_daily_template_with_entry(uuid, text, jsonb, date),
  public.update_daily_template_bundle(uuid, text, jsonb), public.set_daily_template_status(uuid, text),
  public.set_daily_template_item_status(uuid, text), public.save_daily_entry_bundle(uuid, text, boolean, integer, text, jsonb) from public, anon;
grant execute on function public.update_project_details(uuid, text, text), public.set_project_archived(uuid, boolean),
  public.soft_delete_project(uuid), public.create_daily_template_with_entry(uuid, text, jsonb, date),
  public.update_daily_template_bundle(uuid, text, jsonb), public.set_daily_template_status(uuid, text),
  public.set_daily_template_item_status(uuid, text), public.save_daily_entry_bundle(uuid, text, boolean, integer, text, jsonb) to authenticated;

-- Daily 的模板、实例及清单项只能经上述 owner-scoped RPC 写入；登录客户端保留只读查询能力。
revoke all privileges on table public.daily_templates, public.daily_template_items,
  public.daily_entries, public.daily_entry_items from public, anon, authenticated;
grant select on table public.daily_templates, public.daily_template_items,
  public.daily_entries, public.daily_entry_items to authenticated;
