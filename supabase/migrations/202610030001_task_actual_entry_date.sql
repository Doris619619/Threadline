-- 文件用途：允许任务实际耗时显式选择投入日期，保持未安排状态，并复用累计实际与按日账本的原子一致性和字段冲突保护。

-- 普通任务编辑沿用 scheduled_date；新命令仅在当前事务内显式指定本次增减的归属日期。
create or replace function public.capture_task_actual_time()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  previous_minutes integer := coalesce(old.actual_duration_minutes, 0);
  next_minutes integer := coalesce(new.actual_duration_minutes, 0);
  delta integer;
  target_date date;
begin
  delta := next_minutes - case when tg_op = 'INSERT' then 0 else previous_minutes end;
  if delta = 0 then return new; end if;
  target_date := coalesce(nullif(current_setting('threadline.task_actual_entry_date', true), '')::date, new.scheduled_date);
  if target_date is null then raise exception 'TASK_ACTUAL_DATE_REQUIRED' using errcode = '22023'; end if;
  if delta < 0 then
    update public.task_time_entries as entries set minutes = entries.minutes + delta, updated_at = now()
    where entries.owner_id = new.owner_id and entries.task_id = new.id
      and entries.entry_date = target_date and entries.minutes + delta >= 0;
    if not found then raise exception 'TASK_ACTUAL_BELOW_FIXED_HISTORY' using errcode = '22023'; end if;
    return new;
  end if;
  insert into public.task_time_entries(owner_id, task_id, entry_date, project_id, minutes)
  values (new.owner_id, new.id, target_date, new.project_id, delta)
  on conflict (owner_id, task_id, entry_date) do update
    set minutes = task_time_entries.minutes + delta, updated_at = now();
  return new;
end; $$;

-- 捕获编辑打开时的状态、日期、项目与累计耗时；默认仅记录投入，计时结束可在同一事务完成任务。
create or replace function public.record_task_actual(
  p_task_id uuid, p_minutes integer, p_entry_date date, p_expected jsonb, p_complete boolean default false
) returns public.tasks language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  changed public.tasks;
  patch jsonb := jsonb_build_object('actual_duration_minutes', p_minutes);
  previous_context text := current_setting('threadline.task_actual_entry_date', true);
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_entry_date is null or p_minutes < 0 then raise exception 'INVALID_TASK_ACTUAL' using errcode = '22023'; end if;
  if jsonb_typeof(p_expected) is distinct from 'object'
    or not (p_expected ?& array['status', 'scheduled_date', 'deleted_at', 'project_id', 'actual_duration_minutes']) then
    raise exception 'TASK_EXPECTED_REQUIRED' using errcode = '22023';
  end if;
  if p_complete and not (p_expected ? 'completed') then raise exception 'TASK_EXPECTED_REQUIRED' using errcode = '22023'; end if;
  if p_complete and p_expected->>'status' <> 'waiting' then patch := patch || jsonb_build_object('completed', true); end if;
  perform set_config('threadline.task_actual_entry_date', p_entry_date::text, true);
  changed := public.update_task_fields(p_task_id, patch, p_expected);
  if p_complete and changed.status = 'waiting' then changed := public.complete_waiting_task(p_task_id, p_entry_date); end if;
  perform set_config('threadline.task_actual_entry_date', coalesce(previous_context, ''), true);
  return changed;
end; $$;
revoke all on function public.record_task_actual(uuid, integer, date, jsonb, boolean) from public, anon;
grant execute on function public.record_task_actual(uuid, integer, date, jsonb, boolean) to authenticated;
