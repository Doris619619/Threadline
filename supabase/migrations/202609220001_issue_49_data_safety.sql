-- 文件用途：以字段预期值更新任务、按意图修改工作站，并按账号时区原子校验每日收尾；不改写历史数据。

-- 锁定任务后只写显式字段；工作流和耗时归属变化要求用户重新确认。
create or replace function public.update_task_fields(p_task_id uuid, p_changes jsonb, p_expected jsonb)
returns public.tasks language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  previous_task public.tasks; proposed public.tasks; changed public.tasks; field text;
  allowed text[] := array['title','project_id','schedule_pending_time','planned_start_time','planned_end_time','planned_duration_minutes','actual_duration_minutes','completed','importance'];
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or jsonb_typeof(p_expected) is distinct from 'object' then raise exception 'INVALID_TASK_PATCH' using errcode = '22023'; end if;
  select * into previous_task from public.tasks where owner_id = auth.uid() and id = p_task_id for update;
  if previous_task.id is null or previous_task.status = 'trashed' or previous_task.deleted_at is not null then raise exception 'TASK_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (p_expected ?& array['status','scheduled_date','deleted_at']) then raise exception 'TASK_EXPECTED_REQUIRED' using errcode = '22023'; end if;
  for field in select jsonb_object_keys(p_changes) loop
    if not (field = any(allowed)) or not (p_expected ? field) then raise exception 'INVALID_TASK_FIELD' using errcode = '22023'; end if;
  end loop;
  if p_changes ? 'actual_duration_minutes' and not (p_expected ?& array['project_id','actual_duration_minutes']) then raise exception 'TASK_EXPECTED_REQUIRED' using errcode = '22023'; end if;
  for field in select jsonb_object_keys(p_expected) loop
    if not (field = any(allowed || array['status','scheduled_date','deleted_at'])) then raise exception 'INVALID_TASK_FIELD' using errcode = '22023'; end if;
    if (to_jsonb(previous_task)->field) is distinct from (p_expected->field) then raise exception 'TASK_FIELD_CONFLICT:%', field using errcode = '40001'; end if;
  end loop;
  proposed := jsonb_populate_record(previous_task, p_changes);
  if proposed.planned_end_time is not null and (proposed.planned_start_time is null or proposed.planned_end_time <= proposed.planned_start_time) then raise exception 'INVALID_TASK_TIME_RANGE' using errcode = '23514'; end if;
  update public.tasks set title = proposed.title, project_id = proposed.project_id,
    schedule_pending_time = proposed.schedule_pending_time, planned_start_time = proposed.planned_start_time,
    planned_end_time = proposed.planned_end_time, planned_duration_minutes = proposed.planned_duration_minutes,
    actual_duration_minutes = proposed.actual_duration_minutes, completed = proposed.completed,
    completed_at = case when proposed.completed and not previous_task.completed then now() when not proposed.completed then null else previous_task.completed_at end,
    importance = proposed.importance
  where owner_id = auth.uid() and id = p_task_id returning * into changed;
  return changed;
end; $$;
revoke all on function public.update_task_fields(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.update_task_fields(uuid,jsonb,jsonb) to authenticated;

-- 同账号成员命令串行执行；清空仅移除调用者看到的 ID，排序只移动指定成员。
create or replace function public.apply_workstation_command(p_command text, p_task_ids uuid[] default '{}', p_task_id uuid default null, p_anchor_id uuid default null, p_after boolean default false)
returns setof public.workstation_entries language plpgsql security invoker set search_path = pg_catalog, public as $$
declare owner uuid := auth.uid(); ids uuid[]; target integer; next_position integer;
begin
  if owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_command not in ('add','remove','clear','move') then raise exception 'INVALID_WORKSTATION_COMMAND' using errcode = '22023'; end if;
  -- 与任务流转采用相同 task-first 锁顺序，防止加入已删除任务和死锁。
  if p_command = 'add' then
    perform 1 from public.tasks where owner_id = owner and id = p_task_id and status <> 'trashed' and deleted_at is null for update;
    if not found then raise exception 'ACTIVE_TASK_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text || ':workstation', 0));
  if p_command = 'add' then
    select coalesce(max(position), -1) + 1 into next_position from public.workstation_entries where owner_id = owner and removed_at is null;
    insert into public.workstation_entries(owner_id, task_id, position, removed_at) values (owner, p_task_id, next_position, null)
    on conflict (owner_id, task_id) do update set position = excluded.position, removed_at = null where workstation_entries.removed_at is not null;
  elsif p_command in ('remove','clear') then
    update public.workstation_entries set position = null, removed_at = now() where owner_id = owner and removed_at is null and task_id = any(case when p_command = 'remove' then array[p_task_id] else p_task_ids end);
  else
    select coalesce(array_agg(task_id order by position), '{}') into ids from public.workstation_entries where owner_id = owner and removed_at is null;
    if not (p_task_id = any(ids)) or p_anchor_id is null or not (p_anchor_id = any(ids)) or p_task_id = p_anchor_id then raise exception 'WORKSTATION_ANCHOR_CHANGED' using errcode = '40001'; end if;
    ids := array_remove(ids, p_task_id); target := array_position(ids, p_anchor_id);
    if p_after then target := target + 1; end if;
    ids := coalesce(ids[1:target-1], '{}') || array[p_task_id] || coalesce(ids[target:array_length(ids,1)], '{}');
    set constraints workstation_owner_position_key deferred;
    update public.workstation_entries as membership set position = requested.ordinality - 1
      from unnest(ids) with ordinality requested(task_id, ordinality)
      where membership.owner_id = owner and membership.task_id = requested.task_id and membership.removed_at is null;
  end if;
  return query select membership.* from public.workstation_entries membership where membership.owner_id = owner and membership.removed_at is null order by membership.position;
end; $$;
revoke all on function public.apply_workstation_command(text,uuid[],uuid,uuid,boolean) from public, anon;
grant execute on function public.apply_workstation_command(text,uuid[],uuid,uuid,boolean) to authenticated;

-- 旧版加入入口复用幂等命令；既有客户端仍可调用。
create or replace function public.add_workstation_task(p_task_id uuid)
returns public.workstation_entries language plpgsql security invoker set search_path = pg_catalog, public as $$
declare result public.workstation_entries;
begin
  perform public.apply_workstation_command('add', '{}', p_task_id);
  select * into result from public.workstation_entries where owner_id = auth.uid() and task_id = p_task_id;
  return result;
end; $$;

-- 收尾检查和所有写入处于同一事务；复用时区设置的账号锁防止请求期间时区改变。
create or replace function public.close_day_checked(p_close_date date, p_actions jsonb, p_project_minutes jsonb, p_time_zone text)
returns public.daily_close_records language plpgsql security invoker set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); action_record record; previous_task public.tasks; close_record public.daily_close_records; account_zone text; account_today date;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_owner::text, 731));
  select timezone into account_zone from public.habit_settings where owner_id = current_owner;
  account_zone := coalesce(account_zone, 'UTC');
  if p_time_zone is distinct from account_zone then raise exception 'ACCOUNT_TIMEZONE_CHANGED' using errcode = '40001'; end if;
  account_today := (statement_timestamp() at time zone account_zone)::date;
  for action_record in select * from jsonb_to_recordset(coalesce(p_actions, '[]'::jsonb)) as action(task_id uuid, action text, target_date date) loop
    if action_record.action not in ('tomorrow', 'date', 'waiting', 'abandoned') then raise exception 'INVALID_CLOSE_ACTION' using errcode = '22023'; end if;
    if action_record.action in ('tomorrow', 'date') and action_record.target_date is null then raise exception 'CLOSE_TARGET_DATE_REQUIRED' using errcode = '22004'; end if;
    if action_record.action in ('tomorrow','date') and (action_record.target_date < account_today or action_record.target_date = p_close_date) then raise exception 'INVALID_TARGET_DATE' using errcode = '22023'; end if;
    select * into previous_task from public.tasks where owner_id = current_owner and id = action_record.task_id and scheduled_date = p_close_date and status = 'active' and not completed for update;
    if previous_task.id is null then raise exception 'CLOSE_TASK_NOT_FOUND' using errcode = 'P0002'; end if;
    update public.tasks as tasks set
      status = case when action_record.action in ('tomorrow','date') then 'active' when action_record.action = 'waiting' then 'waiting' else 'abandoned' end,
      scheduled_date = case when action_record.action in ('tomorrow','date') then action_record.target_date when action_record.action = 'waiting' then null else tasks.scheduled_date end,
      schedule_pending_time = case when action_record.action = 'waiting' then false else tasks.schedule_pending_time end,
      planned_start_time = case when action_record.action = 'waiting' then null else tasks.planned_start_time end,
      planned_end_time = case when action_record.action = 'waiting' then null else tasks.planned_end_time end,
      importance = case when action_record.action = 'waiting' then coalesce(tasks.importance, 'normal') else tasks.importance end,
      postponed_from = case when action_record.action in ('tomorrow','date') then previous_task.scheduled_date else tasks.postponed_from end,
      postponed_to = case when action_record.action in ('tomorrow','date') then action_record.target_date else tasks.postponed_to end,
      abandoned_at = case when action_record.action = 'abandoned' then now() else tasks.abandoned_at end
    where tasks.owner_id = current_owner and tasks.id = previous_task.id;
    insert into public.history_events(id, owner_id, task_id, event_type, occurred_at, payload, task_title_snapshot, project_id_snapshot, task_date_snapshot)
    values (gen_random_uuid(), current_owner, previous_task.id, 'close_' || action_record.action, now(), jsonb_build_object('fromDate', p_close_date, 'toDate', action_record.target_date), previous_task.title, previous_task.project_id, previous_task.scheduled_date);
  end loop;
  insert into public.daily_history_entries(owner_id, template_id, entry_id, entry_date, project_id, title_snapshot, project_name_snapshot, color_snapshot, completed, actual_duration_minutes, result, record_source)
  select entries.owner_id, entries.template_id, entries.id, entries.entry_date, entries.project_id, entries.title_snapshot, entries.project_name_snapshot, entries.color_snapshot, entries.completed, entries.actual_duration_minutes, coalesce(entries.result, ''), 'close_day' from public.daily_entries entries where entries.owner_id = current_owner and entries.entry_date = p_close_date on conflict (owner_id, template_id, entry_date) do nothing;
  insert into public.daily_close_records(owner_id, close_date, closed_at, project_minutes) values (current_owner, p_close_date, now(), coalesce(p_project_minutes, '{}'::jsonb)) on conflict (owner_id, close_date) do update set closed_at = excluded.closed_at, project_minutes = excluded.project_minutes returning * into close_record;
  return close_record;
end; $$;



revoke all on function public.close_day_checked(date,jsonb,jsonb,text) from public, anon;
grant execute on function public.close_day_checked(date,jsonb,jsonb,text) to authenticated;
-- 旧签名沿用服务端已保存时区；无设置账号显式使用 UTC。
create or replace function public.close_day(p_close_date date, p_actions jsonb, p_project_minutes jsonb)
returns public.daily_close_records language plpgsql security invoker set search_path = pg_catalog, public as $$
declare zone text;
begin
  select timezone into zone from public.habit_settings where owner_id = auth.uid();
  return public.close_day_checked(p_close_date, p_actions, p_project_minutes, coalesce(zone, 'UTC'));
end; $$;
notify pgrst, 'reload schema';

-- 回收站恢复是显式工作流命令，编辑 RPC 不能借此复活被删除的旧表单。
create or replace function public.restore_task(p_task_id uuid, p_target_date date, p_expected_status text, p_expected_deleted_at timestamptz)
returns public.tasks language plpgsql security invoker set search_path = pg_catalog, public as $$
declare previous_task public.tasks; changed public.tasks; zone text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select * into previous_task from public.tasks where owner_id = auth.uid() and id = p_task_id for update;
  if previous_task.id is null then raise exception 'TASK_NOT_FOUND' using errcode = 'P0002'; end if;
  if previous_task.status not in ('trashed','abandoned') or previous_task.status is distinct from p_expected_status or previous_task.deleted_at is distinct from p_expected_deleted_at then raise exception 'TASK_FIELD_CONFLICT:status' using errcode = '40001'; end if;
  select timezone into zone from public.habit_settings where owner_id = auth.uid();
  if p_target_date is null or p_target_date < (statement_timestamp() at time zone coalesce(zone,'UTC'))::date then raise exception 'INVALID_TARGET_DATE' using errcode = '22023'; end if;
  update public.tasks set status = 'active', scheduled_date = p_target_date, schedule_pending_time = true, planned_start_time = null, planned_end_time = null, deleted_at = null
    where owner_id = auth.uid() and id = p_task_id returning * into changed;
  return changed;
end; $$;
revoke all on function public.restore_task(uuid,date,text,timestamptz) from public, anon;
grant execute on function public.restore_task(uuid,date,text,timestamptz) to authenticated;

-- 旧排序入口保留签名并加入同账号锁，避免与新命令交错写位置。
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

  perform pg_advisory_xact_lock(hashtextextended(current_owner::text || ':workstation', 0));
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
notify pgrst, 'reload schema';

-- 保持既有流转语义，仅让原子删除参加工作站账号锁；三参数兼容入口仍转发本函数。
create or replace function public.transition_task(
  p_task_id uuid,
  p_transition text,
  p_target_date date,
  p_time_zone text
)
returns public.tasks language plpgsql security invoker set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); previous_task public.tasks; changed_task public.tasks;
begin
  if p_time_zone is null then raise exception 'INVALID_TIME_ZONE' using errcode = '22023'; end if;
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_transition not in ('scheduled', 'rescheduled', 'waiting', 'abandoned', 'trashed') then raise exception 'INVALID_TASK_TRANSITION' using errcode = '22023'; end if;
  select * into previous_task from public.tasks where owner_id = current_owner and id = p_task_id for update;
  if previous_task.id is null then raise exception 'TASK_NOT_FOUND' using errcode = 'P0002'; end if;
  -- 先锁任务再锁成员队列，与加入命令一致；删除与锚点排序不能交错。
  if p_transition = 'trashed' then
    perform pg_advisory_xact_lock(hashtextextended(current_owner::text || ':workstation', 0));
  end if;
  if previous_task.completed and p_transition in ('scheduled', 'rescheduled', 'waiting', 'abandoned') then raise exception 'COMPLETED_TASK_TRANSITION' using errcode = '23514'; end if;
  if p_transition in ('scheduled', 'rescheduled') and (p_target_date is null or p_target_date < (current_timestamp at time zone p_time_zone)::date) then raise exception 'INVALID_TARGET_DATE' using errcode = '22023'; end if;
  if p_transition = 'scheduled' and (p_target_date is null or previous_task.status <> 'waiting') then raise exception 'INVALID_SCHEDULE_TRANSITION' using errcode = '22023'; end if;
  if p_transition = 'rescheduled' and (p_target_date is null or previous_task.status <> 'active' or p_target_date = previous_task.scheduled_date) then raise exception 'INVALID_TARGET_DATE' using errcode = '22023'; end if;
  if p_transition = 'waiting' and previous_task.status <> 'active' then raise exception 'INVALID_WAITING_TRANSITION' using errcode = '22023'; end if;

  update public.tasks as tasks set
    status = case when p_transition in ('scheduled', 'rescheduled') then 'active' else p_transition end,
    scheduled_date = case when p_transition in ('scheduled', 'rescheduled') then p_target_date when p_transition = 'waiting' then null else tasks.scheduled_date end,
    schedule_pending_time = case when p_transition = 'scheduled' then true when p_transition = 'waiting' then false else tasks.schedule_pending_time end,
    planned_start_time = case when p_transition in ('scheduled', 'waiting') then null else tasks.planned_start_time end,
    planned_end_time = case when p_transition in ('scheduled', 'waiting') then null else tasks.planned_end_time end,
    importance = case when p_transition = 'waiting' then coalesce(tasks.importance, 'normal') else tasks.importance end,
    completed = case when p_transition = 'scheduled' then false else tasks.completed end,
    completed_at = case when p_transition = 'scheduled' then null else tasks.completed_at end,
    postponed_from = case when p_transition = 'rescheduled' then previous_task.scheduled_date else tasks.postponed_from end,
    postponed_to = case when p_transition = 'rescheduled' then p_target_date else tasks.postponed_to end,
    abandoned_at = case when p_transition = 'abandoned' then now() else tasks.abandoned_at end,
    deleted_at = case when p_transition = 'trashed' then now() else tasks.deleted_at end
  where tasks.owner_id = current_owner and tasks.id = p_task_id returning * into changed_task;
  insert into public.history_events(id, owner_id, task_id, event_type, occurred_at, payload, task_title_snapshot, project_id_snapshot, task_date_snapshot)
  values (gen_random_uuid(), current_owner, previous_task.id, p_transition, now(),
    jsonb_build_object('fromDate', previous_task.scheduled_date, 'toDate', case when p_transition in ('scheduled', 'rescheduled') then p_target_date else null end),
    previous_task.title, previous_task.project_id, previous_task.scheduled_date);
  if p_transition = 'trashed' then update public.workstation_entries set removed_at = now(), position = null where owner_id = current_owner and task_id = p_task_id and removed_at is null; end if;
  return changed_task;
end; $$;
