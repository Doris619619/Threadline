-- 文件用途：切换到较早时区后仍可清除已有节律记录；未来日期校验只约束新增或改动日期。
create or replace function private.validate_period_dates() returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare zone text;
begin
  -- 仅更新墓碑/审计字段时保留历史日期，不把账号时区改变当成新增未来记录。
  if tg_op = 'UPDATE' and new.start_date is not distinct from old.start_date
     and new.end_date is not distinct from old.end_date then return new; end if;
  select timezone into zone from public.habit_settings where owner_id = new.owner_id;
  zone := coalesce(zone, 'Asia/Shanghai');
  if new.start_date > (now() at time zone zone)::date or new.end_date > (now() at time zone zone)::date then
    raise exception 'PERIOD_FUTURE_DATE' using errcode = '23514';
  end if;
  return new;
end; $$;
