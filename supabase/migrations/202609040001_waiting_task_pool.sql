-- 文件用途：将旧 backlog/无时间待办收敛为受数据库约束保护的持续待安排任务池。

alter table public.tasks add column if not exists importance text;
update public.tasks
set importance = case when backlog_importance = 'important' then 'important' else 'normal' end
where importance is null;
alter table public.tasks alter column importance set default 'normal';
alter table public.tasks alter column importance set not null;
alter table public.tasks add constraint tasks_importance_check check (importance in ('important', 'normal'));

-- 旧 backlog、未完成旧 quick 与遗留 rescheduled 都必须先规范化，随后才收紧状态形状。
-- 必须先移除旧状态约束：旧库不认识 waiting，否则真实旧任务在转换时会被拒绝。
alter table public.tasks drop constraint if exists tasks_status_check;
update public.tasks
set status = 'waiting', scheduled_date = null, schedule_pending_time = false,
    planned_start_time = null, planned_end_time = null, planned_duration_minutes = null
where status = 'backlog'
   or (status = 'active' and not completed and scheduled_date is not null
       and planned_start_time is null and coalesce(schedule_pending_time, false) = false)
   or (status = 'rescheduled' and scheduled_date is null and not completed);
update public.tasks set status = 'active' where status = 'rescheduled' and scheduled_date is not null;
update public.tasks
set status = 'active', scheduled_date = coalesce((completed_at at time zone 'UTC')::date, (created_at at time zone 'UTC')::date)
where status = 'rescheduled' and scheduled_date is null and completed;

alter table public.tasks add constraint tasks_status_check check (status in ('active', 'waiting', 'abandoned', 'trashed'));
alter table public.tasks add constraint tasks_state_shape_check check (
  (status <> 'waiting' or (scheduled_date is null and schedule_pending_time = false
    and planned_start_time is null and planned_end_time is null and planned_duration_minutes is null))
  and (status <> 'active' or scheduled_date is not null)
);
alter table public.tasks drop column if exists backlog_importance;
alter table public.tasks drop column if exists ddl_at;

-- 单次 UPDATE 同时维护状态与所有日程形状字段，避免客户端补写形成短暂非法状态。
create or replace function public.transition_task(
  p_task_id uuid,
  p_transition text,
  p_target_date date default null
)
returns public.tasks language plpgsql security invoker set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); previous_task public.tasks; changed_task public.tasks;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_transition not in ('scheduled', 'rescheduled', 'waiting', 'abandoned', 'trashed') then raise exception 'INVALID_TASK_TRANSITION' using errcode = '22023'; end if;
  select * into previous_task from public.tasks where owner_id = current_owner and id = p_task_id for update;
  if previous_task.id is null then raise exception 'TASK_NOT_FOUND' using errcode = 'P0002'; end if;
  if previous_task.completed and p_transition in ('scheduled', 'rescheduled', 'waiting', 'abandoned') then raise exception 'COMPLETED_TASK_TRANSITION' using errcode = '23514'; end if;
  if p_transition = 'scheduled' and (p_target_date is null or previous_task.status <> 'waiting') then raise exception 'INVALID_SCHEDULE_TRANSITION' using errcode = '22023'; end if;
  if p_transition = 'rescheduled' and (p_target_date is null or previous_task.status <> 'active' or p_target_date <= previous_task.scheduled_date) then raise exception 'INVALID_TARGET_DATE' using errcode = '22023'; end if;
  if p_transition = 'waiting' and previous_task.status <> 'active' then raise exception 'INVALID_WAITING_TRANSITION' using errcode = '22023'; end if;

  update public.tasks as tasks set
    status = case when p_transition in ('scheduled', 'rescheduled') then 'active' else p_transition end,
    scheduled_date = case when p_transition in ('scheduled', 'rescheduled') then p_target_date when p_transition = 'waiting' then null else tasks.scheduled_date end,
    schedule_pending_time = case when p_transition = 'scheduled' then true when p_transition = 'waiting' then false else tasks.schedule_pending_time end,
    planned_start_time = case when p_transition in ('scheduled', 'waiting') then null else tasks.planned_start_time end,
    planned_end_time = case when p_transition in ('scheduled', 'waiting') then null else tasks.planned_end_time end,
    planned_duration_minutes = case when p_transition in ('scheduled', 'waiting') then null else tasks.planned_duration_minutes end,
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

-- 在完成触发器执行前先为 waiting 补上本地业务日，保证 completion snapshot 与统计归属一致。
create or replace function public.complete_waiting_task(p_task_id uuid, p_completed_date date)
returns public.tasks language plpgsql security invoker set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); changed_task public.tasks;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_completed_date is null then raise exception 'COMPLETED_DATE_REQUIRED' using errcode = '22023'; end if;
  update public.tasks set status = 'active', scheduled_date = p_completed_date, schedule_pending_time = false,
      planned_start_time = null, planned_end_time = null, planned_duration_minutes = null,
      completed = true, completed_at = now()
  where owner_id = current_owner and id = p_task_id and status = 'waiting' and not completed
  returning * into changed_task;
  if changed_task.id is null then raise exception 'WAITING_TASK_NOT_FOUND' using errcode = 'P0002'; end if;
  return changed_task;
end; $$;

-- 收尾时 waiting 与 transition_task 的字段形状完全相同，并保留专属 close history 语义。
create or replace function public.close_day(p_close_date date, p_actions jsonb, p_project_minutes jsonb)
returns public.daily_close_records language plpgsql security invoker set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); action_record record; previous_task public.tasks; close_record public.daily_close_records;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  for action_record in select * from jsonb_to_recordset(coalesce(p_actions, '[]'::jsonb)) as action(task_id uuid, action text, target_date date) loop
    if action_record.action not in ('tomorrow', 'date', 'waiting', 'abandoned') then raise exception 'INVALID_CLOSE_ACTION' using errcode = '22023'; end if;
    if action_record.action in ('tomorrow', 'date') and action_record.target_date is null then raise exception 'CLOSE_TARGET_DATE_REQUIRED' using errcode = '22004'; end if;
    select * into previous_task from public.tasks where owner_id = current_owner and id = action_record.task_id and scheduled_date = p_close_date and status = 'active' and not completed for update;
    if previous_task.id is null then raise exception 'CLOSE_TASK_NOT_FOUND' using errcode = 'P0002'; end if;
    update public.tasks as tasks set
      status = case when action_record.action in ('tomorrow','date') then 'active' when action_record.action = 'waiting' then 'waiting' else 'abandoned' end,
      scheduled_date = case when action_record.action in ('tomorrow','date') then action_record.target_date when action_record.action = 'waiting' then null else tasks.scheduled_date end,
      schedule_pending_time = case when action_record.action = 'waiting' then false else tasks.schedule_pending_time end,
      planned_start_time = case when action_record.action = 'waiting' then null else tasks.planned_start_time end,
      planned_end_time = case when action_record.action = 'waiting' then null else tasks.planned_end_time end,
      planned_duration_minutes = case when action_record.action = 'waiting' then null else tasks.planned_duration_minutes end,
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

revoke all privileges on function public.complete_waiting_task(uuid, date) from public, anon, authenticated;
grant execute on function public.complete_waiting_task(uuid, date) to authenticated;
