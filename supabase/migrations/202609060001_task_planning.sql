-- 文件用途：支持按客户端时区提前或推后改期；只替换函数，不改写任务、历史或投入账本。
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


-- 保留旧三参数入口供旧客户端调用，新客户端显式传 IANA 时区。
create or replace function public.transition_task(p_task_id uuid, p_transition text, p_target_date date default null)
returns public.tasks language sql security invoker set search_path = pg_catalog, public as $$
  select public.transition_task(p_task_id, p_transition, p_target_date, 'UTC');
$$;
revoke all on function public.transition_task(uuid, text, date, text) from public, anon;
grant execute on function public.transition_task(uuid, text, date, text) to authenticated;

notify pgrst, 'reload schema';
