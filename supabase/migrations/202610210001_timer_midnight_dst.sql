-- 文件用途：修正午夜夏令时回拨造成的计时统计丢失，按每个自然日最早的有效瞬间切分，保留原始记录和视图权限。

-- 返回指定时区自然日的首次有效瞬间；重复午夜取第一次，午夜不存在时定位跳时后的日界，完全跳过的日期与下一日共用边界。
create function private.timer_day_start(p_date date, p_timezone text)
returns timestamptz language plpgsql stable strict security invoker set search_path = pg_catalog as $$
declare
  midnight timestamp := p_date::timestamp;
  conventional timestamptz := midnight at time zone p_timezone;
  earliest timestamptz;
  probe timestamptz;
  candidate timestamptz;
  utc_offset interval;
  lo timestamptz;
  hi timestamptz;
  middle timestamptz;
begin
  -- PostgreSQL 的歧义墙钟默认选择第二个午夜；分别尝试日界附近的真实偏移，保留可精确映射回午夜的最早候选。
  for probe in select conventional + step * interval '1 day' from generate_series(-2, 2) step loop
    utc_offset := (probe at time zone p_timezone) - (probe at time zone 'UTC');
    candidate := midnight at time zone utc_offset;
    if candidate at time zone p_timezone = midnight then
      earliest := least(earliest, candidate);
    end if;
  end loop;
  if earliest is not null then return earliest; end if;

  -- 跳时可能跨过午夜，不能把 00:00 强行平移成 01:00；在真实时间线上二分到本地日期首次到达目标日的瞬间。
  lo := conventional - interval '2 days';
  hi := conventional;
  while hi - lo > interval '1 microsecond' loop
    middle := lo + (hi - lo) / 2;
    if (middle at time zone p_timezone)::date >= p_date then hi := middle;
    else lo := middle;
    end if;
  end loop;
  return hi;
end; $$;
revoke all on function private.timer_day_start(date, text) from public, anon, authenticated;
grant execute on function private.timer_day_start(date, text) to authenticated;

-- 替换投影而不重建表、RPC 或关账依赖；每个时区/日期的边界只求一次，分摊仍先处理账号全部已保存会话。
create or replace view public.task_time_statistics with (security_invoker = true) as
with intervals as (
  select r.*, to_timestamp((p->>'start')::double precision / 1000) as starts,
    to_timestamp((p->>'end')::double precision / 1000) as ends
  from public.task_timer_records r cross join lateral jsonb_array_elements(r.intervals) p
), days as (
  select i.*, day::date as actual_date
  from intervals i cross join lateral generate_series(
    (starts at time zone timezone)::date::timestamp,
    ((ends - interval '1 microsecond') at time zone timezone)::date::timestamp,
    interval '1 day') day
), dates as (
  select timezone, actual_date as local_date from days
  union select timezone, actual_date + 1 as local_date from days
), midnights as materialized (
  select timezone, local_date, private.timer_day_start(local_date, timezone) as starts
  from dates
), parts as (
  select d.*, greatest(d.starts, lo.starts) as lo, least(d.ends, hi.starts) as hi
  from days d join midnights lo on lo.timezone = d.timezone and lo.local_date = d.actual_date
  join midnights hi on hi.timezone = d.timezone and hi.local_date = d.actual_date + 1
  where greatest(d.starts, lo.starts) < least(d.ends, hi.starts)
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
