-- 文件用途：原子保存不可变计时时段与原始分钟，提供按账号去重、逐时段按任务均分的统计投影，保留旧账本。

create table public.task_timer_records (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid,
  task_key uuid not null,
  project_id uuid not null,
  entry_date date not null,
  timezone text not null,
  intervals jsonb not null,
  raw_minutes integer not null check (raw_minutes >= 0),
  ledger_id uuid references public.task_time_entries(id),
  created_at timestamptz not null default now(),
  foreign key(owner_id, task_id) references public.tasks(owner_id, id) on delete set null (task_id),
  foreign key(owner_id, project_id) references public.projects(owner_id, id)
);
create index task_timer_records_owner_date on public.task_timer_records(owner_id, entry_date);
create index task_timer_records_task on public.task_timer_records(owner_id, task_id, entry_date);
alter table public.task_timer_records enable row level security;
create policy "users read their timer records" on public.task_timer_records for select to authenticated using (owner_id = auth.uid());
revoke all on public.task_timer_records from public, anon, authenticated;
grant select on public.task_timer_records to authenticated;
alter publication supabase_realtime add table public.task_timer_records;

-- 只允许完整时段写入；请求 ID 在未知网络结果重试时保持不变，先匹配已保存请求再检查任务旧基准。
create function public.record_task_timer(
  p_task_id uuid, p_minutes integer, p_entry_date date, p_expected jsonb,
  p_recording jsonb
) returns public.tasks language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  owner uuid := auth.uid(); saved public.task_timer_records; changed public.tasks;
  session_id uuid := (p_recording->>'id')::uuid;
  parts jsonb := p_recording->'intervals'; zone text := p_recording->>'timezone';
  part jsonb; start_ms numeric; end_ms numeric; prior_end numeric := -1; elapsed numeric := 0;
  raw integer;
  latest_expected jsonb;
begin
  if owner is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 160001));
  if session_id is null or p_entry_date is null or p_minutes is null or p_minutes < 0
    or jsonb_typeof(parts) is distinct from 'array' or jsonb_array_length(parts) > 10000
    or not exists(select 1 from pg_timezone_names where name = zone) then
    raise exception 'INVALID_TIMER_RECORD';
  end if;
  for part in select value from jsonb_array_elements(parts) loop
    if jsonb_typeof(part->'start') is distinct from 'number' or jsonb_typeof(part->'end') is distinct from 'number' then
      raise exception 'INVALID_TIMER_INTERVAL';
    end if;
    start_ms := (part->>'start')::numeric; end_ms := (part->>'end')::numeric;
    if start_ms < 0 or end_ms <= start_ms or start_ms < prior_end
      or trunc(start_ms) <> start_ms or trunc(end_ms) <> end_ms
      or end_ms > extract(epoch from clock_timestamp()) * 1000 + 300000 then
      raise exception 'INVALID_TIMER_INTERVAL';
    end if;
    elapsed := elapsed + end_ms - start_ms; prior_end := end_ms;
  end loop;
  raw := round(elapsed / 60000)::integer;
  if p_minutes <> coalesce((p_expected->>'actual_duration_minutes')::integer, 0) + raw then
    raise exception 'TIMER_MINUTES_MISMATCH';
  end if;
  select * into saved from public.task_timer_records where id = session_id;
  if found then
    if saved.owner_id <> owner or saved.task_key <> p_task_id or saved.entry_date <> p_entry_date
      or saved.timezone <> zone or saved.intervals <> parts or saved.raw_minutes <> raw then
      raise exception 'TIMER_REQUEST_REUSED';
    end if;
    select * into changed from public.tasks where id = p_task_id and owner_id = owner;
    if not found then raise exception 'TASK_NOT_FOUND'; end if;
    return changed;
  end if;
  -- 每个新会话是增量。另一设备完成同一任务后，仍可原子追加，不用旧累计值覆盖新账本。
  select * into changed from public.tasks where id = p_task_id and owner_id = owner for update;
  if not found or changed.deleted_at is not null or changed.status not in ('active', 'waiting') then
    raise exception 'TASK_NOT_FOUND';
  end if;
  if changed.project_id::text is distinct from p_expected->>'project_id' then
    raise exception 'TASK_FIELD_CONFLICT:project_id' using errcode = '40001';
  end if;
  select jsonb_object_agg(key, value) into latest_expected from jsonb_each(to_jsonb(changed))
    where key = any(array['status','scheduled_date','deleted_at','project_id','actual_duration_minutes','completed']);
  changed := public.record_task_actual(p_task_id, coalesce(changed.actual_duration_minutes, 0) + raw, p_entry_date, latest_expected, true);
  insert into public.task_timer_records(id, owner_id, task_id, task_key, project_id, entry_date, timezone, intervals, raw_minutes, ledger_id)
  values(session_id, owner, p_task_id, p_task_id, changed.project_id, p_entry_date, zone, parts, raw,
    (select id from public.task_time_entries where owner_id = owner and task_id = p_task_id and entry_date = p_entry_date));
  return changed;
end; $$;
revoke all on function public.record_task_timer(uuid, integer, date, jsonb, jsonb) from public, anon;
grant execute on function public.record_task_timer(uuid, integer, date, jsonb, jsonb) to authenticated;

-- 原始计时不可被普通分钟编辑抹除；仍可修正没有时段的手动补录余额。
create function public.protect_recorded_timer_minutes() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.minutes < coalesce((select sum(raw_minutes) from public.task_timer_records
    where ledger_id = new.id), 0) then
    raise exception 'TASK_ACTUAL_BELOW_TIMER_RECORDS';
  end if;
  return new;
end; $$;
revoke all on function public.protect_recorded_timer_minutes() from public, anon, authenticated;
create trigger protect_recorded_timer_minutes before update on public.task_time_entries
for each row execute function public.protect_recorded_timer_minutes();

-- 投影始终先处理账号的全部会话，再由调用方筛日期/项目；按自然日边界切片，夏令时不假定一天 24 小时。
create view public.task_time_statistics with (security_invoker = true) as
with intervals as (
  select r.*, to_timestamp((p->>'start')::double precision / 1000) as starts,
    to_timestamp((p->>'end')::double precision / 1000) as ends
  from public.task_timer_records r cross join lateral jsonb_array_elements(r.intervals) p
), parts as (
  select i.*, day::date as actual_date,
    greatest(starts, day::timestamp at time zone timezone) as lo,
    least(ends, (day::date + 1)::timestamp at time zone timezone) as hi
  from intervals i cross join lateral generate_series(
    (starts at time zone timezone)::date::timestamp,
    ((ends - interval '1 microsecond') at time zone timezone)::date::timestamp,
    interval '1 day') day
), boundaries as (
  select owner_id, lo as stamp from parts union select owner_id, hi from parts
), slices as (
  select owner_id, stamp, lead(stamp) over(partition by owner_id order by stamp) as next_stamp from boundaries
), candidates as (
  select s.stamp, s.next_stamp, p.*,
    row_number() over(partition by s.owner_id, s.stamp, p.task_key order by p.id) as duplicate
  from slices s join parts p on p.owner_id = s.owner_id and p.lo <= s.stamp and p.hi >= s.next_stamp
  where s.next_stamp > s.stamp
), shares as (
  select *, extract(epoch from(next_stamp - stamp)) / 60 /
    count(*) over(partition by owner_id, stamp) as share
  from candidates where duplicate = 1
), allocations as (
  select id::text || ':' || actual_date::text as id, owner_id, task_id, project_id,
    actual_date as entry_date, sum(share) as minutes, 0::numeric as raw_minutes, 'allocated'::text as timing
  from shares group by id, owner_id, task_id, project_id, actual_date
)
select e.id::text as id, e.owner_id, e.task_id, e.project_id, e.entry_date,
  greatest(0, e.minutes - coalesce((select sum(r.raw_minutes) from public.task_timer_records r
    where r.ledger_id = e.id), 0))::numeric as minutes,
  e.minutes::numeric as raw_minutes, 'unlocated'::text as timing
from public.task_time_entries e
union all select * from allocations;
revoke all on public.task_time_statistics from public, anon, authenticated;
grant select on public.task_time_statistics to authenticated;

-- 新关账使用相同统计口径；Daily 已独立于项目，不混入项目快照，已有快照不回填。
alter table public.daily_close_records add column time_accounting_version integer not null default 0;
create or replace function public.capture_daily_close_project_minutes()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  new.time_accounting_version := 1;
  select coalesce(jsonb_object_agg(project_id::text, minutes), '{}'::jsonb) into new.project_minutes
  from (
    select project_id, sum(minutes) as minutes from public.task_time_statistics
    where owner_id = new.owner_id and entry_date = new.close_date
    group by project_id
  ) totals;
  return new;
end; $$;
