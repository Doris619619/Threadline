-- 文件用途：把 Threadline 升级为跨端权威工作区 schema，并建立 RLS、Realtime 与原子业务命令。

create extension if not exists pgcrypto;
create schema if not exists private;

alter table public.projects alter column id set default gen_random_uuid();
alter table public.tasks alter column id set default gen_random_uuid();
alter table public.daily_definitions alter column id set default gen_random_uuid();
alter table public.daily_instances alter column id set default gen_random_uuid();
alter table public.daily_subtasks alter column id set default gen_random_uuid();
alter table public.daily_subtask_instances alter column id set default gen_random_uuid();
alter table public.history_events alter column id set default gen_random_uuid();
alter table public.daily_close_records alter column id set default gen_random_uuid();

-- 在任意可变行更新前写入数据库审计时间，不接受客户端时间。
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.projects
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists position integer,
  add column if not exists is_fallback boolean not null default false;

with ranked as (
  select id, row_number() over (partition by owner_id order by created_at, id) - 1 as next_position
  from public.projects
)
update public.projects as projects
set position = ranked.next_position
from ranked
where projects.id = ranked.id and projects.position is null;

alter table public.projects
  alter column position set not null,
  add constraint projects_position_nonnegative check (position >= 0),
  add constraint projects_fallback_active check (not is_fallback or status = 'active'),
  add constraint projects_owner_id_id_key unique (owner_id, id);

create unique index projects_one_fallback_per_owner_idx
  on public.projects(owner_id)
  where is_fallback;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
before update on public.projects
for each row execute function private.touch_updated_at();

alter table public.tasks
  drop constraint if exists tasks_project_id_fkey;
alter table public.tasks
  alter column ddl_at type timestamp without time zone using ddl_at::timestamp without time zone,
  add constraint tasks_owner_id_id_key unique (owner_id, id),
  add constraint tasks_owner_project_fkey
    foreign key (owner_id, project_id)
    references public.projects(owner_id, id);

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
before update on public.tasks
for each row execute function private.touch_updated_at();

alter table public.daily_definitions rename to daily_templates;
alter table public.daily_templates rename column active to is_active;
alter table public.daily_templates
  drop constraint if exists daily_definitions_project_id_fkey;
alter table public.daily_templates
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists position integer;

with ranked as (
  select id, row_number() over (partition by owner_id order by created_at, id) - 1 as next_position
  from public.daily_templates
)
update public.daily_templates as templates
set position = ranked.next_position
from ranked
where templates.id = ranked.id and templates.position is null;

alter table public.daily_templates
  alter column position set not null,
  add constraint daily_templates_position_nonnegative check (position >= 0),
  add constraint daily_templates_owner_id_id_key unique (owner_id, id),
  add constraint daily_templates_owner_project_fkey
    foreign key (owner_id, project_id)
    references public.projects(owner_id, id);

drop trigger if exists daily_templates_touch_updated_at on public.daily_templates;
create trigger daily_templates_touch_updated_at
before update on public.daily_templates
for each row execute function private.touch_updated_at();

alter table public.daily_subtasks rename to daily_template_items;
alter table public.daily_template_items rename column definition_id to template_id;
alter table public.daily_template_items
  drop constraint if exists daily_subtasks_definition_id_fkey;
alter table public.daily_template_items
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add constraint daily_template_items_owner_id_id_key unique (owner_id, id),
  add constraint daily_template_items_owner_template_fkey
    foreign key (owner_id, template_id)
    references public.daily_templates(owner_id, id)
    on delete cascade;

drop trigger if exists daily_template_items_touch_updated_at on public.daily_template_items;
create trigger daily_template_items_touch_updated_at
before update on public.daily_template_items
for each row execute function private.touch_updated_at();

alter table public.daily_instances rename to daily_entries;
alter table public.daily_entries rename column definition_id to template_id;
alter table public.daily_entries rename column instance_date to entry_date;
alter table public.daily_entries
  drop constraint if exists daily_instances_definition_id_fkey,
  drop constraint if exists daily_instances_definition_id_instance_date_key;
alter table public.daily_entries
  add column if not exists project_id uuid,
  add column if not exists title_snapshot text,
  add column if not exists project_name_snapshot text,
  add column if not exists color_snapshot text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.daily_entries as entries
set project_id = templates.project_id,
    title_snapshot = templates.title,
    project_name_snapshot = projects.name,
    color_snapshot = projects.color
from public.daily_templates as templates
join public.projects as projects
  on projects.owner_id = templates.owner_id and projects.id = templates.project_id
where entries.owner_id = templates.owner_id and entries.template_id = templates.id;

alter table public.daily_entries
  alter column project_id set not null,
  alter column title_snapshot set not null,
  alter column project_name_snapshot set not null,
  alter column color_snapshot set not null,
  add constraint daily_entries_title_snapshot_length
    check (char_length(trim(title_snapshot)) between 1 and 200),
  add constraint daily_entries_color_snapshot_format
    check (color_snapshot ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint daily_entries_owner_id_id_key unique (owner_id, id),
  add constraint daily_entries_owner_identity_key
    unique (owner_id, id, template_id, entry_date),
  add constraint daily_entries_owner_template_date_key
    unique (owner_id, template_id, entry_date),
  add constraint daily_entries_owner_template_fkey
    foreign key (owner_id, template_id)
    references public.daily_templates(owner_id, id),
  add constraint daily_entries_owner_project_fkey
    foreign key (owner_id, project_id)
    references public.projects(owner_id, id);

drop trigger if exists daily_entries_touch_updated_at on public.daily_entries;
create trigger daily_entries_touch_updated_at
before update on public.daily_entries
for each row execute function private.touch_updated_at();

alter table public.daily_subtask_instances rename to daily_entry_items;
alter table public.daily_entry_items rename column instance_id to entry_id;
alter table public.daily_entry_items rename column subtask_id to template_item_id;
alter table public.daily_entry_items
  drop constraint if exists daily_subtask_instances_instance_id_fkey,
  drop constraint if exists daily_subtask_instances_subtask_id_fkey,
  drop constraint if exists daily_subtask_instances_instance_id_subtask_id_key;
alter table public.daily_entry_items
  alter column template_item_id drop not null,
  add column if not exists title_snapshot text,
  add column if not exists position integer,
  add column if not exists actual_duration_minutes integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.daily_entry_items as items
set title_snapshot = templates.title,
    position = templates.position
from public.daily_template_items as templates
where items.owner_id = templates.owner_id and items.template_item_id = templates.id;

alter table public.daily_entry_items
  alter column title_snapshot set not null,
  alter column position set not null,
  add constraint daily_entry_items_title_snapshot_length
    check (char_length(trim(title_snapshot)) between 1 and 200),
  add constraint daily_entry_items_position_nonnegative check (position >= 0),
  add constraint daily_entry_items_actual_nonnegative check (actual_duration_minutes >= 0),
  add constraint daily_entry_items_owner_id_id_key unique (owner_id, id),
  add constraint daily_entry_items_owner_entry_position_key
    unique (owner_id, entry_id, position),
  add constraint daily_entry_items_owner_entry_fkey
    foreign key (owner_id, entry_id)
    references public.daily_entries(owner_id, id)
    on delete cascade,
  add constraint daily_entry_items_owner_template_item_fkey
    foreign key (owner_id, template_item_id)
    references public.daily_template_items(owner_id, id)
    on delete set null (template_item_id);

create unique index daily_entry_items_template_mapping_idx
  on public.daily_entry_items(owner_id, entry_id, template_item_id)
  where template_item_id is not null;

-- 拒绝把某天 entry item 映射到同 owner 下另一个 Daily template 的 item。
create or replace function private.enforce_daily_entry_item_template_mapping()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.template_item_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.daily_entries as entries
    join public.daily_template_items as template_items
      on template_items.owner_id = entries.owner_id
     and template_items.template_id = entries.template_id
    where entries.owner_id = new.owner_id
      and entries.id = new.entry_id
      and template_items.id = new.template_item_id
  ) then
    raise exception 'DAILY_TEMPLATE_ITEM_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger daily_entry_items_template_mapping_guard
before insert or update of owner_id, entry_id, template_item_id
on public.daily_entry_items
for each row execute function private.enforce_daily_entry_item_template_mapping();

drop trigger if exists daily_entry_items_touch_updated_at on public.daily_entry_items;
create trigger daily_entry_items_touch_updated_at
before update on public.daily_entry_items
for each row execute function private.touch_updated_at();

alter table public.history_events rename column daily_instance_id to daily_entry_id;
alter table public.history_events
  drop constraint if exists history_events_task_id_fkey,
  drop constraint if exists history_events_daily_instance_id_fkey,
  drop constraint if exists history_events_check;
alter table public.history_events
  add column if not exists task_title_snapshot text,
  add column if not exists project_id_snapshot uuid,
  add column if not exists task_date_snapshot date,
  add constraint history_events_owner_id_id_key unique (owner_id, id),
  add constraint history_events_owner_task_fkey
    foreign key (owner_id, task_id)
    references public.tasks(owner_id, id)
    on delete set null (task_id),
  add constraint history_events_owner_daily_entry_fkey
    foreign key (owner_id, daily_entry_id)
    references public.daily_entries(owner_id, id)
    on delete set null (daily_entry_id);

update public.history_events as events
set task_title_snapshot = tasks.title,
    project_id_snapshot = tasks.project_id,
    task_date_snapshot = tasks.scheduled_date
from public.tasks as tasks
where events.owner_id = tasks.owner_id and events.task_id = tasks.id;

alter table public.history_events
  add constraint history_events_retained_identity check (
    task_id is not null
    or daily_entry_id is not null
    or task_title_snapshot is not null
  );

alter table public.daily_close_records
  add column if not exists updated_at timestamptz not null default now(),
  add constraint daily_close_records_owner_id_id_key unique (owner_id, id);

drop trigger if exists daily_close_records_touch_updated_at on public.daily_close_records;
create trigger daily_close_records_touch_updated_at
before update on public.daily_close_records
for each row execute function private.touch_updated_at();

create table public.workspace_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  initialized_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_history_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id uuid not null,
  entry_id uuid not null,
  entry_date date not null,
  project_id uuid not null,
  title_snapshot text not null check (char_length(trim(title_snapshot)) between 1 and 200),
  project_name_snapshot text not null,
  color_snapshot text not null check (color_snapshot ~ '^#[0-9A-Fa-f]{6}$'),
  completed boolean not null default false,
  actual_duration_minutes integer not null default 0 check (actual_duration_minutes >= 0),
  result text not null default '',
  record_source text not null check (record_source in ('manual', 'close_day')),
  recorded_at timestamptz not null default now(),
  unique (owner_id, template_id, entry_date),
  unique (owner_id, id),
  foreign key (owner_id, template_id)
    references public.daily_templates(owner_id, id),
  foreign key (owner_id, entry_id, template_id, entry_date)
    references public.daily_entries(owner_id, id, template_id, entry_date),
  foreign key (owner_id, project_id)
    references public.projects(owner_id, id)
);

create table public.workstation_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null,
  position integer,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workstation_position_state check (
    (removed_at is null and position is not null and position >= 0)
    or (removed_at is not null and position is null)
  ),
  constraint workstation_owner_task_key unique (owner_id, task_id),
  constraint workstation_owner_position_key
    unique (owner_id, position) deferrable initially immediate,
  constraint workstation_owner_id_id_key unique (owner_id, id),
  constraint workstation_owner_task_fkey
    foreign key (owner_id, task_id)
    references public.tasks(owner_id, id)
    on delete cascade
);

create table public.rhythm_marks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mark_date date not null,
  marked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, mark_date),
  unique (owner_id, id)
);

create index daily_entries_owner_date_idx
  on public.daily_entries(owner_id, entry_date);
create index daily_history_owner_date_idx
  on public.daily_history_entries(owner_id, entry_date desc);
create index workstation_owner_active_position_idx
  on public.workstation_entries(owner_id, position)
  where removed_at is null;
create index rhythm_marks_owner_date_idx
  on public.rhythm_marks(owner_id, mark_date desc);

create trigger workspace_profiles_touch_updated_at
before update on public.workspace_profiles
for each row execute function private.touch_updated_at();
create trigger workstation_entries_touch_updated_at
before update on public.workstation_entries
for each row execute function private.touch_updated_at();
create trigger rhythm_marks_touch_updated_at
before update on public.rhythm_marks
for each row execute function private.touch_updated_at();

alter table public.workspace_profiles enable row level security;
alter table public.daily_history_entries enable row level security;
alter table public.workstation_entries enable row level security;
alter table public.rhythm_marks enable row level security;

drop policy if exists "users manage their daily definitions" on public.daily_templates;
drop policy if exists "users manage their daily instances" on public.daily_entries;
drop policy if exists "users manage their daily subtasks" on public.daily_template_items;
drop policy if exists "users manage their daily subtask instances" on public.daily_entry_items;

create policy "users manage their workspace profile"
on public.workspace_profiles for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their daily templates"
on public.daily_templates for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their daily entries"
on public.daily_entries for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their daily template items"
on public.daily_template_items for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their daily entry items"
on public.daily_entry_items for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their daily history"
on public.daily_history_entries for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their workstation"
on public.workstation_entries for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their rhythm"
on public.rhythm_marks for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 幂等初始化账号，并在首次调用时原子创建五个 UUID 默认项目。
create or replace function public.initialize_workspace()
returns setof public.projects
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_owner uuid := auth.uid();
  did_initialize boolean;
begin
  if current_owner is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  insert into public.workspace_profiles(owner_id)
  values (current_owner)
  on conflict (owner_id) do nothing
  returning true into did_initialize;

  if coalesce(did_initialize, false) then
    insert into public.projects(id, owner_id, name, color, status, position, is_fallback)
    values
      (gen_random_uuid(), current_owner, '工作', '#4f8cff', 'active', 0, false),
      (gen_random_uuid(), current_owner, '课程', '#8b7cf6', 'active', 1, false),
      (gen_random_uuid(), current_owner, 'AI研究', '#38a774', 'active', 2, false),
      (gen_random_uuid(), current_owner, '生活', '#e9a04b', 'active', 3, false),
      (gen_random_uuid(), current_owner, '其他', '#8793a7', 'active', 4, true);
  end if;

  return query
    select projects.*
    from public.projects as projects
    where projects.owner_id = current_owner
    order by projects.position, projects.created_at;
end;
$$;

-- 首次访问业务日期时从 active templates 幂等复制 entry/item snapshots。
create or replace function public.ensure_daily_entries_for_date(p_entry_date date)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_owner uuid := auth.uid();
  result jsonb;
begin
  if current_owner is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_entry_date is null then
    raise exception 'ENTRY_DATE_REQUIRED' using errcode = '22004';
  end if;

  with inserted_entries as (
    insert into public.daily_entries(
      id, owner_id, template_id, entry_date, project_id, title_snapshot,
      project_name_snapshot, color_snapshot, completed, actual_duration_minutes, result
    )
    select gen_random_uuid(), templates.owner_id, templates.id, p_entry_date,
      templates.project_id, templates.title, projects.name, projects.color, false, 0, ''
    from public.daily_templates as templates
    join public.projects as projects
      on projects.owner_id = templates.owner_id and projects.id = templates.project_id
    where templates.owner_id = current_owner and templates.is_active
    on conflict (owner_id, template_id, entry_date) do nothing
    returning id, owner_id, template_id
  )
  insert into public.daily_entry_items(
    id, owner_id, entry_id, template_item_id, title_snapshot,
    position, completed, actual_duration_minutes
  )
  select gen_random_uuid(), inserted.owner_id, inserted.id, items.id,
    items.title, items.position, false, 0
  from inserted_entries as inserted
  join public.daily_template_items as items
    on items.owner_id = inserted.owner_id and items.template_id = inserted.template_id;

  select jsonb_build_object(
    'entries', coalesce(jsonb_agg(to_jsonb(entries) order by templates.position), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(items) order by items.entry_id, items.position)
      from public.daily_entry_items as items
      join public.daily_entries as item_entries
        on item_entries.owner_id = items.owner_id and item_entries.id = items.entry_id
      where items.owner_id = current_owner and item_entries.entry_date = p_entry_date
    ), '[]'::jsonb)
  )
  into result
  from public.daily_entries as entries
  join public.daily_templates as templates
    on templates.owner_id = entries.owner_id and templates.id = entries.template_id
  where entries.owner_id = current_owner and entries.entry_date = p_entry_date;

  return coalesce(result, jsonb_build_object('entries', '[]'::jsonb, 'items', '[]'::jsonb));
end;
$$;

-- 将已 materialize 的日期实例记录为唯一正式 Daily history snapshot。
create or replace function public.record_daily_history(
  p_template_id uuid,
  p_entry_date date,
  p_record_source text default 'manual'
)
returns public.daily_history_entries
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_owner uuid := auth.uid();
  recorded public.daily_history_entries;
begin
  if current_owner is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_record_source not in ('manual', 'close_day') then
    raise exception 'INVALID_RECORD_SOURCE' using errcode = '22023';
  end if;

  insert into public.daily_history_entries(
    owner_id, template_id, entry_id, entry_date, project_id,
    title_snapshot, project_name_snapshot, color_snapshot,
    completed, actual_duration_minutes, result, record_source
  )
  select entries.owner_id, entries.template_id, entries.id, entries.entry_date,
    entries.project_id, entries.title_snapshot, entries.project_name_snapshot,
    entries.color_snapshot, entries.completed, entries.actual_duration_minutes,
    coalesce(entries.result, ''), p_record_source
  from public.daily_entries as entries
  where entries.owner_id = current_owner
    and entries.template_id = p_template_id
    and entries.entry_date = p_entry_date
  on conflict (owner_id, template_id, entry_date) do nothing
  returning * into recorded;

  if recorded.id is null then
    select history.* into recorded
    from public.daily_history_entries as history
    where history.owner_id = current_owner
      and history.template_id = p_template_id
      and history.entry_date = p_entry_date;
  end if;
  if recorded.id is null then
    raise exception 'DAILY_ENTRY_NOT_FOUND' using errcode = 'P0002';
  end if;
  return recorded;
end;
$$;

-- 原子创建长期 Daily template 并 materialize 当前业务日期。
create or replace function public.create_daily_template_with_entry(
  p_template_id uuid,
  p_project_id uuid,
  p_title text,
  p_entry_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_owner uuid := auth.uid();
  next_position integer;
begin
  if current_owner is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if char_length(trim(p_title)) not between 1 and 200 then
    raise exception 'INVALID_DAILY_TITLE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.projects
    where owner_id = current_owner and id = p_project_id and status = 'active'
  ) then
    raise exception 'ACTIVE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_owner::text || ':daily-template', 0));
  select coalesce(max(position), -1) + 1 into next_position
  from public.daily_templates
  where owner_id = current_owner;

  insert into public.daily_templates(
    id, owner_id, project_id, title, is_active, position
  ) values (
    p_template_id, current_owner, p_project_id, trim(p_title), true, next_position
  );
  return public.ensure_daily_entries_for_date(p_entry_date);
end;
$$;

-- 原子提交 task 状态迁移、history snapshot 与 trash 工作站副作用。
create or replace function public.transition_task(
  p_task_id uuid,
  p_transition text,
  p_target_date date default null
)
returns public.tasks
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_owner uuid := auth.uid();
  previous_task public.tasks;
  changed_task public.tasks;
begin
  if current_owner is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_transition not in ('scheduled', 'rescheduled', 'backlog', 'abandoned', 'trashed') then
    raise exception 'INVALID_TASK_TRANSITION' using errcode = '22023';
  end if;

  select tasks.* into previous_task
  from public.tasks as tasks
  where tasks.owner_id = current_owner and tasks.id = p_task_id
  for update;
  if previous_task.id is null then
    raise exception 'TASK_NOT_FOUND' using errcode = 'P0002';
  end if;
  if previous_task.completed and p_transition in ('scheduled', 'rescheduled', 'backlog', 'abandoned') then
    raise exception 'COMPLETED_TASK_TRANSITION' using errcode = '23514';
  end if;
  if p_transition = 'scheduled' and p_target_date is null then
    raise exception 'INVALID_TARGET_DATE' using errcode = '22023';
  end if;
  if p_transition = 'rescheduled' and (p_target_date is null or p_target_date <= previous_task.scheduled_date) then
    raise exception 'INVALID_TARGET_DATE' using errcode = '22023';
  end if;

  update public.tasks as tasks
  set status = case when p_transition in ('scheduled', 'rescheduled') then 'active' else p_transition end,
      scheduled_date = case when p_transition in ('scheduled', 'rescheduled') then p_target_date else null end,
      completed = case when p_transition in ('scheduled', 'rescheduled') then false else tasks.completed end,
      completed_at = case when p_transition in ('scheduled', 'rescheduled') then null else tasks.completed_at end,
      postponed_from = case when p_transition = 'scheduled'
        then tasks.postponed_from
        else coalesce(previous_task.scheduled_date, tasks.postponed_from)
      end,
      postponed_to = case when p_transition = 'rescheduled' then p_target_date else tasks.postponed_to end,
      abandoned_at = case when p_transition = 'abandoned' then now() else tasks.abandoned_at end,
      deleted_at = case when p_transition = 'trashed' then now() else tasks.deleted_at end
  where tasks.owner_id = current_owner and tasks.id = p_task_id
  returning tasks.* into changed_task;

  insert into public.history_events(
    id, owner_id, task_id, event_type, occurred_at, payload,
    task_title_snapshot, project_id_snapshot, task_date_snapshot
  ) values (
    gen_random_uuid(), current_owner, previous_task.id, p_transition, now(),
    jsonb_strip_nulls(jsonb_build_object(
      'fromDate', previous_task.scheduled_date,
      'toDate', case when p_transition in ('scheduled', 'rescheduled') then p_target_date else null end
    )),
    previous_task.title, previous_task.project_id, previous_task.scheduled_date
  );

  if p_transition = 'trashed' then
    update public.workstation_entries
    set removed_at = now(), position = null
    where owner_id = current_owner and task_id = p_task_id and removed_at is null;
  end if;

  return changed_task;
end;
$$;

-- 添加或重新激活 membership，并在 owner 的 active 队列末尾分配 position。
create or replace function public.add_workstation_task(p_task_id uuid)
returns public.workstation_entries
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_owner uuid := auth.uid();
  membership public.workstation_entries;
  next_position integer;
begin
  if current_owner is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.tasks
    where owner_id = current_owner and id = p_task_id and status <> 'trashed'
  ) then
    raise exception 'ACTIVE_TASK_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_owner::text || ':workstation', 0));
  select coalesce(max(position), -1) + 1 into next_position
  from public.workstation_entries
  where owner_id = current_owner and removed_at is null;

  insert into public.workstation_entries(owner_id, task_id, position, removed_at)
  values (current_owner, p_task_id, next_position, null)
  on conflict (owner_id, task_id) do update
    set position = excluded.position, removed_at = null
  returning * into membership;
  return membership;
end;
$$;

-- 校验完整 active 集合后延迟唯一约束并原子提交全部 position。
create or replace function public.reorder_workstation(p_task_ids uuid[])
returns setof public.workstation_entries
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_owner uuid := auth.uid();
  requested_count integer := coalesce(array_length(p_task_ids, 1), 0);
  active_count integer;
begin
  if current_owner is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if requested_count <> (
    select count(distinct task_id) from unnest(coalesce(p_task_ids, '{}'::uuid[])) as task_id
  ) then
    raise exception 'DUPLICATE_WORKSTATION_TASK' using errcode = '22023';
  end if;

  select count(*) into active_count
  from public.workstation_entries
  where owner_id = current_owner and removed_at is null;
  if active_count <> requested_count or exists (
    select 1
    from unnest(coalesce(p_task_ids, '{}'::uuid[])) as requested(task_id)
    left join public.workstation_entries as membership
      on membership.owner_id = current_owner
      and membership.task_id = requested.task_id
      and membership.removed_at is null
    where membership.id is null
  ) then
    raise exception 'WORKSTATION_SET_MISMATCH' using errcode = '22023';
  end if;

  set constraints workstation_owner_position_key deferred;
  update public.workstation_entries as membership
  set position = requested.ordinality - 1
  from unnest(coalesce(p_task_ids, '{}'::uuid[])) with ordinality
    as requested(task_id, ordinality)
  where membership.owner_id = current_owner
    and membership.task_id = requested.task_id
    and membership.removed_at is null;

  return query
    select membership.*
    from public.workstation_entries as membership
    where membership.owner_id = current_owner and membership.removed_at is null
    order by membership.position;
end;
$$;

-- 原子提交未完成 task 流转、history、正式 Daily history 与 close record。
create or replace function public.close_day(
  p_close_date date,
  p_actions jsonb,
  p_project_minutes jsonb
)
returns public.daily_close_records
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_owner uuid := auth.uid();
  action_record record;
  previous_task public.tasks;
  close_record public.daily_close_records;
begin
  if current_owner is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  for action_record in
    select * from jsonb_to_recordset(coalesce(p_actions, '[]'::jsonb))
      as action(task_id uuid, action text, target_date date)
  loop
    if action_record.action not in ('tomorrow', 'date', 'backlog', 'abandoned') then
      raise exception 'INVALID_CLOSE_ACTION' using errcode = '22023';
    end if;
    if action_record.action in ('tomorrow', 'date') and action_record.target_date is null then
      raise exception 'CLOSE_TARGET_DATE_REQUIRED' using errcode = '22004';
    end if;
    select tasks.* into previous_task
    from public.tasks as tasks
    where tasks.owner_id = current_owner
      and tasks.id = action_record.task_id
      and tasks.scheduled_date = p_close_date
      and not tasks.completed
    for update;
    if previous_task.id is null then
      raise exception 'CLOSE_TASK_NOT_FOUND' using errcode = 'P0002';
    end if;

    update public.tasks as tasks
    set status = case when action_record.action in ('tomorrow', 'date') then 'active'
                      when action_record.action = 'backlog' then 'backlog'
                      else 'abandoned' end,
        scheduled_date = case
          when action_record.action in ('tomorrow', 'date') then action_record.target_date
          when action_record.action = 'abandoned' then tasks.scheduled_date
          else null
        end,
        postponed_from = case when action_record.action in ('tomorrow', 'date')
                              then previous_task.scheduled_date else tasks.postponed_from end,
        postponed_to = case when action_record.action in ('tomorrow', 'date')
                            then action_record.target_date else tasks.postponed_to end,
        abandoned_at = case when action_record.action = 'abandoned' then now()
                            else tasks.abandoned_at end
    where tasks.owner_id = current_owner and tasks.id = previous_task.id;

    insert into public.history_events(
      id, owner_id, task_id, event_type, occurred_at, payload,
      task_title_snapshot, project_id_snapshot, task_date_snapshot
    ) values (
      gen_random_uuid(), current_owner, previous_task.id,
      'close_' || action_record.action, now(),
      jsonb_strip_nulls(jsonb_build_object(
        'fromDate', p_close_date,
        'toDate', action_record.target_date
      )),
      previous_task.title, previous_task.project_id, previous_task.scheduled_date
    );
  end loop;

  insert into public.daily_history_entries(
    owner_id, template_id, entry_id, entry_date, project_id,
    title_snapshot, project_name_snapshot, color_snapshot,
    completed, actual_duration_minutes, result, record_source
  )
  select entries.owner_id, entries.template_id, entries.id, entries.entry_date,
    entries.project_id, entries.title_snapshot, entries.project_name_snapshot,
    entries.color_snapshot, entries.completed, entries.actual_duration_minutes,
    coalesce(entries.result, ''), 'close_day'
  from public.daily_entries as entries
  where entries.owner_id = current_owner and entries.entry_date = p_close_date
  on conflict (owner_id, template_id, entry_date) do nothing;

  insert into public.daily_close_records(owner_id, close_date, closed_at, project_minutes)
  values (current_owner, p_close_date, now(), coalesce(p_project_minutes, '{}'::jsonb))
  on conflict (owner_id, close_date) do update
    set closed_at = excluded.closed_at, project_minutes = excluded.project_minutes
  returning * into close_record;
  return close_record;
end;
$$;

-- 仅供数据库受信上下文物理删除超过 30 天的 trashed tasks，并保留 history snapshots。
create or replace function private.purge_expired_tasks()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  deleted_count bigint;
begin
  delete from public.tasks
  where status = 'trashed'
    and deleted_at is not null
    and deleted_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function private.purge_expired_tasks() from public;
revoke all on function private.purge_expired_tasks() from anon;
revoke all on function private.purge_expired_tasks() from authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'projects', 'tasks', 'daily_templates', 'daily_template_items',
    'daily_entries', 'daily_entry_items', 'workstation_entries', 'rhythm_marks',
    'daily_history_entries', 'history_events', 'daily_close_records'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

do $$
declare
  job_exists boolean;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select exists (select 1 from cron.job where jobname = $1)'
      into job_exists
      using 'threadline-purge-expired-tasks';
    if not job_exists then
      execute $schedule$
        select cron.schedule(
          'threadline-purge-expired-tasks',
          '17 3 * * *',
          'select private.purge_expired_tasks()'
        )
      $schedule$;
    end if;
  end if;
end;
$$;
