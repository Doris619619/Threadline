-- 文件用途：新增阶段计划及原任务的阶段归属，保留执行链路、账号隔离和阶段历史。
create table public.stage_plans (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  start_date date not null check (isfinite(start_date)),
  end_date date not null check (isfinite(end_date)),
  home_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, id),
  check (end_date >= start_date)
);
alter table public.stage_plans enable row level security;
revoke all on public.stage_plans from anon, authenticated;
grant select, insert, update on public.stage_plans to authenticated;
grant all on public.stage_plans to service_role;
create policy stage_plans_owner on public.stage_plans for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger stage_plans_touch_updated_at before update on public.stage_plans
  for each row execute function private.touch_updated_at();
create index stage_plans_owner_range_idx on public.stage_plans(owner_id, start_date, end_date) where deleted_at is null;

alter table public.tasks add column stage_plan_id uuid;
alter table public.tasks add constraint tasks_owner_stage_plan_fkey
  foreign key (owner_id, stage_plan_id) references public.stage_plans(owner_id, id);
create index tasks_owner_stage_plan_idx on public.tasks(owner_id, stage_plan_id) where stage_plan_id is not null;

-- 阶段关闭与追加按同一父行锁串行；普通任务编辑不改阶段归属。
create function private.check_task_stage_plan() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if new.stage_plan_id is not null then
    perform 1 from public.stage_plans where owner_id = new.owner_id and id = new.stage_plan_id
      and deleted_at is null for update;
    if not found then raise exception 'STAGE_NOT_FOUND' using errcode = '23503'; end if;
  end if;
  return new;
end;
$$;
create trigger tasks_check_stage_plan before insert or update of stage_plan_id on public.tasks
  for each row execute function private.check_task_stage_plan();

-- 一次事务写入阶段与清单；固定 ID 的同一请求可安全重试，失败不会留下半个阶段。
create function public.create_stage_plan(p_id uuid, p_name text, p_start_date date, p_end_date date,
  p_home_visible boolean, p_tasks jsonb default '[]'::jsonb) returns jsonb
language plpgsql security invoker set search_path = pg_catalog as $$
declare owner uuid := auth.uid(); plan public.stage_plans; fallback uuid; item jsonb;
begin
  if owner is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if jsonb_typeof(p_tasks) is distinct from 'array' then raise exception 'INVALID_TASKS' using errcode = '22023'; end if;
  -- 插入锁同时保护两次完全并发的创建；不先执行存在性判断再插入。
  insert into public.stage_plans(id, name, start_date, end_date, home_visible)
    values (p_id, trim(p_name), p_start_date, p_end_date, p_home_visible)
    on conflict (id) do nothing returning * into plan;
  if plan.id is null then
    select * into plan from public.stage_plans where id = p_id and owner_id = owner and deleted_at is null;
    if plan.id is null then raise exception 'STAGE_NOT_FOUND' using errcode = 'P0002'; end if;
    if plan.name is distinct from trim(p_name) or plan.start_date is distinct from p_start_date
      or plan.end_date is distinct from p_end_date or plan.home_visible is distinct from p_home_visible
      or exists (select 1 from jsonb_array_elements(p_tasks) draft where not exists (
        select 1 from public.tasks where owner_id = owner and id = (draft->>'id')::uuid
          and stage_plan_id = p_id and title = trim(draft->>'title')))
    then raise exception 'STAGE_REQUEST_REUSED' using errcode = '40001'; end if;
  else
    select id into fallback from public.projects where owner_id = owner and is_fallback and deleted_at is null;
    if fallback is null then raise exception 'WORKSPACE_NOT_INITIALIZED'; end if;
    for item in select value from jsonb_array_elements(p_tasks) loop
      insert into public.tasks(id, project_id, stage_plan_id, title, status, importance, schedule_pending_time)
        values ((item->>'id')::uuid, fallback, p_id, trim(item->>'title'), 'waiting', 'normal', false);
      insert into public.history_events(id, task_id, event_type, task_title_snapshot, project_id_snapshot, payload)
        values (gen_random_uuid(), (item->>'id')::uuid, 'created', trim(item->>'title'), fallback,
          jsonb_build_object('title', trim(item->>'title'), 'stagePlanId', p_id));
    end loop;
  end if;
  return jsonb_build_object('plan', to_jsonb(plan), 'tasks', coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.tasks t
      where t.owner_id = owner and t.stage_plan_id = p_id), '[]'::jsonb));
end;
$$;

-- 元数据按精确版本受检更新，旧表单不能覆盖其他设备的日期或首页意愿。
create function public.update_stage_plan(p_id uuid, p_expected_updated_at timestamptz, p_changes jsonb)
returns public.stage_plans language plpgsql security invoker set search_path = pg_catalog as $$
declare plan public.stage_plans; field text;
begin
  select * into plan from public.stage_plans where id = p_id and owner_id = auth.uid() and deleted_at is null for update;
  if plan.id is null then raise exception 'STAGE_NOT_FOUND' using errcode = 'P0002'; end if;
  if plan.updated_at is distinct from p_expected_updated_at then raise exception 'STAGE_CONFLICT' using errcode = '40001'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'INVALID_STAGE_FIELD' using errcode = '22023'; end if;
  for field in select jsonb_object_keys(p_changes) loop
    if field not in ('name', 'start_date', 'end_date', 'home_visible') then raise exception 'INVALID_STAGE_FIELD' using errcode = '22023'; end if;
  end loop;
  update public.stage_plans set
    name = case when p_changes ? 'name' then trim(p_changes->>'name') else name end,
    start_date = case when p_changes ? 'start_date' then (p_changes->>'start_date')::date else start_date end,
    end_date = case when p_changes ? 'end_date' then (p_changes->>'end_date')::date else end_date end,
    home_visible = case when p_changes ? 'home_visible' then (p_changes->>'home_visible')::boolean else home_visible end
    where id = p_id and owner_id = auth.uid() returning * into plan;
  return plan;
end;
$$;

-- 连续追加只新建一个原 Task；稳定 ID 重试不新增第二项，也不改写已安排状态。
create function public.append_stage_task(p_stage_id uuid, p_task_id uuid, p_title text)
returns public.tasks language plpgsql security invoker set search_path = pg_catalog as $$
declare fallback uuid; task public.tasks;
begin
  perform 1 from public.stage_plans where id = p_stage_id and owner_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'STAGE_NOT_FOUND' using errcode = 'P0002'; end if;
  select id into fallback from public.projects where owner_id = auth.uid() and is_fallback and deleted_at is null;
  if fallback is null then raise exception 'WORKSPACE_NOT_INITIALIZED'; end if;
  insert into public.tasks(id, project_id, stage_plan_id, title, status, importance, schedule_pending_time)
    values (p_task_id, fallback, p_stage_id, trim(p_title), 'waiting', 'normal', false)
    on conflict (id) do nothing returning * into task;
  if task.id is null then
    select * into task from public.tasks where owner_id = auth.uid() and id = p_task_id
      and stage_plan_id = p_stage_id and title = trim(p_title);
    if task.id is null then raise exception 'STAGE_REQUEST_REUSED' using errcode = '40001'; end if;
  else
    insert into public.history_events(id, task_id, event_type, task_title_snapshot, project_id_snapshot, payload)
      values (gen_random_uuid(), task.id, 'created', task.title, fallback,
        jsonb_build_object('title', task.title, 'stagePlanId', p_stage_id));
  end if;
  return task;
end;
$$;

-- 移除只清除关联，不删除、不改期，也不修改项目或实际投入账本。
create function public.remove_stage_task(p_stage_id uuid, p_task_id uuid)
returns public.tasks language plpgsql security invoker set search_path = pg_catalog as $$
declare task public.tasks;
begin
  perform 1 from public.stage_plans where id = p_stage_id and owner_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'STAGE_NOT_FOUND' using errcode = 'P0002'; end if;
  update public.tasks set stage_plan_id = null where id = p_task_id and owner_id = auth.uid()
    and stage_plan_id = p_stage_id returning * into task;
  if task.id is null then raise exception 'STAGE_TASK_NOT_FOUND' using errcode = 'P0002'; end if;
  return task;
end;
$$;

-- 阶段删除与任务脱离在同一事务；只更新归属列，保留并发日程操作的其他字段。
create function public.soft_delete_stage_plan(p_id uuid, p_expected_updated_at timestamptz)
returns public.stage_plans language plpgsql security invoker set search_path = pg_catalog as $$
declare plan public.stage_plans;
begin
  select * into plan from public.stage_plans where id = p_id and owner_id = auth.uid() for update;
  if plan.id is null then raise exception 'STAGE_NOT_FOUND' using errcode = 'P0002'; end if;
  if plan.deleted_at is not null then return plan; end if;
  if plan.updated_at is distinct from p_expected_updated_at then raise exception 'STAGE_CONFLICT' using errcode = '40001'; end if;
  update public.tasks set stage_plan_id = null where stage_plan_id = p_id and owner_id = auth.uid();
  update public.stage_plans set deleted_at = now(), home_visible = false
    where id = p_id and owner_id = auth.uid() returning * into plan;
  return plan;
end;
$$;

-- 阶段回顾永久保留；只有已脱离阶段的普通回收站项继续执行原 30 天清理。
create or replace function private.purge_expired_tasks() returns bigint
language plpgsql security definer set search_path = pg_catalog as $$
declare deleted_count bigint;
begin
  delete from public.tasks where status = 'trashed' and deleted_at is not null
    and deleted_at < now() - interval '30 days' and stage_plan_id is null;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function private.purge_expired_tasks() from public, anon, authenticated;
revoke all on function public.create_stage_plan(uuid,text,date,date,boolean,jsonb) from public, anon;
revoke all on function public.update_stage_plan(uuid,timestamptz,jsonb) from public, anon;
revoke all on function public.append_stage_task(uuid,uuid,text) from public, anon;
revoke all on function public.remove_stage_task(uuid,uuid) from public, anon;
revoke all on function public.soft_delete_stage_plan(uuid,timestamptz) from public, anon;
grant execute on function public.create_stage_plan(uuid,text,date,date,boolean,jsonb),
  public.update_stage_plan(uuid,timestamptz,jsonb), public.append_stage_task(uuid,uuid,text),
  public.remove_stage_task(uuid,uuid), public.soft_delete_stage_plan(uuid,timestamptz) to authenticated;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.stage_plans;
  end if;
end $$;
notify pgrst, 'reload schema';
