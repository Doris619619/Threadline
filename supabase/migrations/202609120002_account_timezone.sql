-- 文件用途：提升习惯时区为整个账号的日期真源；兼容旧客户端，不移动任何历史记录。
create function public.set_account_timezone(p_timezone text, p_expected_version integer, p_request_id uuid)
returns public.habit_settings language plpgsql security definer set search_path = pg_catalog, public as $$
declare owner uuid := auth.uid(); settings public.habit_settings;
begin
  if owner is null then raise exception 'HABIT_AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'HABIT_INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 731));
  perform private.habit_ensure_account(owner, p_timezone);
  select * into settings from public.habit_settings where owner_id = owner for update;
  -- null 只用于首次读取/初始化，绝不覆盖其他设备已存在的选择。
  if p_expected_version is null or p_request_id = any(settings.request_ids) then return settings; end if;
  if settings.version <> p_expected_version then raise exception 'HABIT_CONFLICT_SETTINGS'; end if;
  update public.habit_settings set timezone = p_timezone, version = version + 1,
    updated_at = clock_timestamp(), request_ids = array_append(request_ids, p_request_id)
    where owner_id = owner returning * into settings;
  return settings;
end; $$;
revoke all on function public.set_account_timezone(text,integer,uuid) from public, anon, authenticated;
grant execute on function public.set_account_timezone(text,integer,uuid) to authenticated;

-- 新客户端的节律未来日期判断采用同一账号时区；尚未初始化的旧账号保持原北京时间规则。
create or replace function private.validate_period_dates() returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare zone text;
begin
  select timezone into zone from public.habit_settings where owner_id = new.owner_id;
  zone := coalesce(zone, 'Asia/Shanghai');
  if new.start_date > (now() at time zone zone)::date or new.end_date > (now() at time zone zone)::date then
    raise exception 'PERIOD_FUTURE_DATE' using errcode = '23514';
  end if;
  return new;
end; $$;
notify pgrst, 'reload schema';
