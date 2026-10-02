-- 文件用途：阶段任务原子保存选填预计分钟，沿用 tasks 字段；默认空值兼容旧客户端。
create or replace function public.create_stage_plan(p_id uuid, p_name text, p_start_date date, p_end_date date,
  p_home_visible boolean, p_tasks jsonb default '[]'::jsonb) returns jsonb
language plpgsql security invoker set search_path = pg_catalog as $$
declare owner uuid := auth.uid(); plan public.stage_plans; fallback uuid; selected_project uuid; item jsonb;
begin
  if owner is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if jsonb_typeof(p_tasks) is distinct from 'array' then raise exception 'INVALID_TASKS' using errcode = '22023'; end if;
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
          and stage_plan_id = p_id and title = trim(draft->>'title')
          and (draft->>'projectId' is null or project_id = (draft->>'projectId')::uuid)
          and planned_duration_minutes is not distinct from (draft->>'plannedDurationMinutes')::integer))
    then raise exception 'STAGE_REQUEST_REUSED' using errcode = '40001'; end if;
  else
    select id into fallback from public.projects where owner_id = owner and is_fallback and deleted_at is null;
    if fallback is null then raise exception 'WORKSPACE_NOT_INITIALIZED'; end if;
    for item in select value from jsonb_array_elements(p_tasks) loop
      selected_project := coalesce((item->>'projectId')::uuid, fallback);
      -- 锁住项目状态，避免检查与写入之间项目被归档或软删除；RLS 和 owner 双重隔离。
      perform 1 from public.projects where id = selected_project and owner_id = owner
        and status = 'active' and deleted_at is null for share;
      if not found then raise exception 'ACTIVE_PROJECT_NOT_FOUND' using errcode = 'P0002'; end if;
      insert into public.tasks(id, project_id, stage_plan_id, title, status, importance, schedule_pending_time, planned_duration_minutes)
        values ((item->>'id')::uuid, selected_project, p_id, trim(item->>'title'), 'waiting', 'normal', false, (item->>'plannedDurationMinutes')::integer);
      insert into public.history_events(id, task_id, event_type, task_title_snapshot, project_id_snapshot, payload)
        values (gen_random_uuid(), (item->>'id')::uuid, 'created', trim(item->>'title'), selected_project,
          jsonb_build_object('title', trim(item->>'title'), 'stagePlanId', p_id));
    end loop;
  end if;
  return jsonb_build_object('plan', to_jsonb(plan), 'tasks', coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.tasks t
      where t.owner_id = owner and t.stage_plan_id = p_id), '[]'::jsonb));
end;
$$;

-- 用带默认参数的单个签名兼容原三参数客户端，避免 PostgREST 解析重载歧义。
drop function public.append_stage_task(uuid,uuid,text,uuid);
create function public.append_stage_task(p_stage_id uuid, p_task_id uuid, p_title text, p_project_id uuid default null, p_planned_duration_minutes integer default null)
returns public.tasks language plpgsql security invoker set search_path = pg_catalog as $$
declare selected_project uuid; task public.tasks;
begin
  perform 1 from public.stage_plans where id = p_stage_id and owner_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'STAGE_NOT_FOUND' using errcode = 'P0002'; end if;
  -- 已确认请求的重试先返回原 Task，不受后续归档影响，也不改期或取消完成。
  select * into task from public.tasks where owner_id = auth.uid() and id = p_task_id;
  if task.id is not null then
    if task.stage_plan_id is distinct from p_stage_id or task.title is distinct from trim(p_title)
      or (p_project_id is not null and task.project_id is distinct from p_project_id)
      or task.planned_duration_minutes is distinct from p_planned_duration_minutes
    then raise exception 'STAGE_REQUEST_REUSED' using errcode = '40001'; end if;
    return task;
  end if;
  selected_project := p_project_id;
  if selected_project is null then
    select id into selected_project from public.projects where owner_id = auth.uid() and is_fallback and deleted_at is null;
  end if;
  perform 1 from public.projects where id = selected_project and owner_id = auth.uid()
    and status = 'active' and deleted_at is null for share;
  if not found then raise exception 'ACTIVE_PROJECT_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.tasks(id, project_id, stage_plan_id, title, status, importance, schedule_pending_time, planned_duration_minutes)
    values (p_task_id, selected_project, p_stage_id, trim(p_title), 'waiting', 'normal', false, p_planned_duration_minutes)
    returning * into task;
  insert into public.history_events(id, task_id, event_type, task_title_snapshot, project_id_snapshot, payload)
    values (gen_random_uuid(), task.id, 'created', task.title, selected_project,
      jsonb_build_object('title', task.title, 'stagePlanId', p_stage_id));
  return task;
end;
$$;
revoke all on function public.append_stage_task(uuid,uuid,text,uuid,integer) from public, anon;
grant execute on function public.append_stage_task(uuid,uuid,text,uuid,integer) to authenticated;
notify pgrst, 'reload schema';
