-- 文件用途：新增独立习惯记录、账号时区、版本化分档及不可改写修订；只允许受控 RPC 写入。
create table public.habit_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null,
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  request_ids uuid[] not null default '{}'
);
create table public.habit_rule_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  effective_from date not null,
  wake_target integer not null check (wake_target between 0 and 1439),
  sleep_target integer not null check (sleep_target >= 240),
  sleep_late integer not null,
  sleep_very_late integer not null check (sleep_very_late < 1680),
  created_at timestamptz not null default clock_timestamp(),
  constraint habit_rule_order check (sleep_target < sleep_late and sleep_late < sleep_very_late),
  unique (owner_id, id)
);
create index habit_rules_by_date on public.habit_rule_versions(owner_id, effective_from desc, created_at desc);
create table public.habit_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_date date not null,
  kind text not null check (kind in ('wake', 'sleep', 'efficiency')),
  occurred_at timestamptz,
  local_time timestamp,
  timezone text not null,
  efficiency text,
  rule_id uuid not null,
  source text not null check (source in ('automatic', 'manual')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  unique (owner_id, id),
  foreign key (owner_id, rule_id) references public.habit_rule_versions(owner_id, id),
  constraint habit_value_kind check (
    (kind = 'efficiency' and efficiency in ('good','medium','poor') and efficiency is not null and occurred_at is null and local_time is null)
    or (kind in ('wake','sleep') and efficiency is null and occurred_at is not null and local_time is not null)
  )
);
create unique index habit_one_active_entry on public.habit_entries(owner_id, business_date, kind) where deleted_at is null;
create index habit_entries_by_date on public.habit_entries(owner_id, business_date);
create table public.habit_entry_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null,
  request_id uuid not null,
  snapshot jsonb not null,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (owner_id, entry_id) references public.habit_entries(owner_id, id),
  unique (owner_id, request_id, entry_id)
);
-- RLS 隔离 SELECT；普通账号不能直接插入、修改或删除上述表。
alter table public.habit_settings enable row level security;
alter table public.habit_rule_versions enable row level security;
alter table public.habit_entries enable row level security;
alter table public.habit_entry_revisions enable row level security;
create policy habit_settings_owner on public.habit_settings for select to authenticated using (owner_id = auth.uid());
create policy habit_rules_owner on public.habit_rule_versions for select to authenticated using (owner_id = auth.uid());
create policy habit_entries_owner on public.habit_entries for select to authenticated using (owner_id = auth.uid());
create policy habit_revisions_owner on public.habit_entry_revisions for select to authenticated using (owner_id = auth.uid());
revoke all on public.habit_settings, public.habit_rule_versions, public.habit_entries, public.habit_entry_revisions from public, anon, authenticated;
grant select on public.habit_settings, public.habit_rule_versions, public.habit_entries, public.habit_entry_revisions to authenticated;
grant all on public.habit_settings, public.habit_rule_versions, public.habit_entries, public.habit_entry_revisions to service_role;

-- 私有校验不接受固定偏移或未知时区，配置和手工补录均调用。
create function private.habit_check_timezone(p_timezone text) returns void language plpgsql
set search_path = pg_catalog, public as $$
begin
  if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone)
    or p_timezone ~ '^[+-]' then raise exception 'HABIT_INVALID_TIMEZONE' using errcode = '23514'; end if;
end; $$;

-- 初始化只发生在显式写入中；同账号事务先取得 advisory lock，防止首次多设备创建冲突。
create function private.habit_ensure_account(p_owner uuid, p_timezone text) returns void language plpgsql
set search_path = pg_catalog, public as $$
begin
  perform private.habit_check_timezone(p_timezone);
  insert into public.habit_settings(owner_id, timezone) values(p_owner, p_timezone) on conflict do nothing;
  if not exists(select 1 from public.habit_rule_versions where owner_id = p_owner) then
    insert into public.habit_rule_versions(owner_id, effective_from, wake_target, sleep_target, sleep_late, sleep_very_late)
    values(p_owner, '0001-01-01', 410, 1400, 1440, 1470);
  end if;
end; $$;

-- 保存账号时区及下一业务日期规则；规则只追加，新设置不改变已有记录的规则引用。
create function public.configure_habits(p_timezone text, p_initial_timezone text, p_rules jsonb, p_expected_version integer, p_request_id uuid)
returns public.habit_settings language plpgsql security definer set search_path = pg_catalog, public as $$
declare owner uuid := auth.uid(); settings public.habit_settings; local_now timestamp; effective date;
begin
  if owner is null then raise exception 'HABIT_AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_request_id is null or p_expected_version is null then raise exception 'HABIT_INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 731));
  perform private.habit_ensure_account(owner, p_initial_timezone);
  select * into settings from public.habit_settings where owner_id = owner for update;
  if p_request_id = any(settings.request_ids) then return settings; end if;
  if settings.version <> p_expected_version then raise exception 'HABIT_CONFLICT_SETTINGS'; end if;
  perform private.habit_check_timezone(p_timezone);
  local_now := clock_timestamp() at time zone settings.timezone;
  effective := local_now::date + case when local_now::time < time '04:00' then 0 else 1 end;
  insert into public.habit_rule_versions(owner_id, effective_from, wake_target, sleep_target, sleep_late, sleep_very_late)
  values(owner, effective, (p_rules->>'wake_target')::integer, (p_rules->>'sleep_target')::integer,
    (p_rules->>'sleep_late')::integer, (p_rules->>'sleep_very_late')::integer);
  update public.habit_settings set timezone = p_timezone, version = version + 1,
    updated_at = clock_timestamp(), request_ids = array_append(request_ids, p_request_id)
    where owner_id = owner returning * into settings;
  return settings;
end; $$;

-- 批量打卡/编辑/清除/恢复。全批事务 + 乐观版本锁；请求重试返回当前记录而不是旧修订。
create function public.apply_habit_entries(p_request_id uuid, p_changes jsonb, p_timezone text, p_settings_version integer)
returns setof public.habit_entries language plpgsql security definer set search_path = pg_catalog, public as $$
declare owner uuid := auth.uid(); settings public.habit_settings; change jsonb; previous public.habit_entries;
  saved public.habit_entries; duplicate public.habit_entries; mode text; kind_value text; zone text;
  instant timestamptz; wall timestamp; day date; rule uuid; changed_id uuid; result_ids uuid[] := '{}'::uuid[];
begin
  if owner is null then raise exception 'HABIT_AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_request_id is null or p_settings_version is null or p_changes is null or jsonb_typeof(p_changes) <> 'array'
    or jsonb_array_length(p_changes) not between 1 and 3 then raise exception 'HABIT_INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 731));
  if exists(select 1 from public.habit_entry_revisions where owner_id = owner and request_id = p_request_id) then
    return query select e.* from public.habit_entries e where e.owner_id = owner and e.id in
      (select entry_id from public.habit_entry_revisions where owner_id = owner and request_id = p_request_id);
    return;
  end if;
  perform private.habit_ensure_account(owner, p_timezone);
  select * into settings from public.habit_settings where owner_id = owner;
  if settings.version <> p_settings_version or settings.timezone <> p_timezone then raise exception 'HABIT_CONFLICT_SETTINGS'; end if;
  for change in select value from jsonb_array_elements(p_changes) loop
    previous := null; saved := null; duplicate := null;
    mode := change->>'mode'; kind_value := change->>'kind';
    if mode is null or mode not in ('record','edit','clear','restore') or kind_value is null or kind_value not in ('wake','sleep','efficiency') then raise exception 'HABIT_INVALID_REQUEST'; end if;
    if change->>'id' is not null then
      select * into previous from public.habit_entries where owner_id = owner and id = (change->>'id')::uuid for update;
      if previous.id is null or previous.kind <> kind_value or (change->>'expected_version')::integer is distinct from previous.version then raise exception 'HABIT_CONFLICT_ENTRY'; end if;
      if mode = 'record' and kind_value <> 'efficiency' then raise exception 'HABIT_INVALID_REQUEST'; end if;
    end if;
    if mode in ('clear','restore') then
      if previous.id is null or (mode = 'restore' and previous.deleted_at is null) then raise exception 'HABIT_CONFLICT_ENTRY'; end if;
      update public.habit_entries set deleted_at = case when mode = 'clear' then clock_timestamp() else null end,
        version = version + 1, updated_at = clock_timestamp() where owner_id = owner and id = previous.id returning * into saved;
    else
      if previous.deleted_at is not null then raise exception 'HABIT_CONFLICT_ENTRY'; end if;
      zone := case when mode = 'record' then settings.timezone else coalesce(change->>'timezone', previous.timezone, settings.timezone) end;
      perform private.habit_check_timezone(zone);
      instant := coalesce((change->>'occurred_at')::timestamptz, clock_timestamp());
      if not isfinite(instant) or instant > clock_timestamp() + interval '5 minutes' then raise exception 'HABIT_INVALID_FUTURE'; end if;
      wall := instant at time zone zone;
      day := case when mode = 'record' then wall::date - case when kind_value <> 'wake' and wall::time < time '04:00' then 1 else 0 end
        else (change->>'business_date')::date end;
      if day is null or not isfinite(day) or day < date '0001-01-01' or day > (clock_timestamp() at time zone zone)::date then raise exception 'HABIT_INVALID_DATE'; end if;
      if kind_value <> 'efficiency' and (wall::date < day or wall::date > day + case when kind_value = 'sleep' then 1 else 0 end) then raise exception 'HABIT_INVALID_DATE'; end if;
      select * into duplicate from public.habit_entries where owner_id = owner and business_date = day and kind = kind_value and deleted_at is null and id is distinct from previous.id;
      if duplicate.id is not null and mode = 'record' and kind_value <> 'efficiency' then
        saved := duplicate;
      else
        if duplicate.id is not null then raise exception 'HABIT_CONFLICT_DUPLICATE'; end if;
        if previous.id is not null and day = previous.business_date then rule := previous.rule_id;
        else select id into rule from public.habit_rule_versions where owner_id = owner and effective_from <= day order by effective_from desc, created_at desc limit 1; end if;
        if previous.id is null then
          insert into public.habit_entries(owner_id, business_date, kind, occurred_at, local_time, timezone, efficiency, rule_id, source)
          values(owner, day, kind_value, case when kind_value = 'efficiency' then null else instant end,
            case when kind_value = 'efficiency' then null else wall end, zone,
            case when kind_value = 'efficiency' then change->>'efficiency' else null end, rule,
            case when mode = 'record' then 'automatic' else 'manual' end) returning * into saved;
        else
          update public.habit_entries set business_date = day, occurred_at = case when kind_value = 'efficiency' then null else instant end,
            local_time = case when kind_value = 'efficiency' then null else wall end, timezone = zone,
            efficiency = case when kind_value = 'efficiency' then change->>'efficiency' else null end, rule_id = rule,
            source = case when mode = 'record' then 'automatic' else 'manual' end, version = version + 1, updated_at = clock_timestamp()
            where owner_id = owner and id = previous.id returning * into saved;
        end if;
      end if;
    end if;
    changed_id := saved.id;
    if changed_id = any(result_ids) then raise exception 'HABIT_INVALID_DUPLICATE_CHANGE'; end if;
    result_ids := array_append(result_ids, changed_id);
    insert into public.habit_entry_revisions(owner_id, entry_id, request_id, snapshot) values(owner, saved.id, p_request_id, to_jsonb(saved));
  end loop;
  return query select e.* from public.habit_entries e where e.owner_id = owner and e.id = any(result_ids);
end; $$;

revoke all on function private.habit_check_timezone(text), private.habit_ensure_account(uuid,text) from public, anon, authenticated;
revoke all on function public.configure_habits(text,text,jsonb,integer,uuid), public.apply_habit_entries(uuid,jsonb,text,integer) from public, anon;
grant execute on function public.configure_habits(text,text,jsonb,integer,uuid), public.apply_habit_entries(uuid,jsonb,text,integer) to authenticated;
alter publication supabase_realtime add table public.habit_settings, public.habit_rule_versions, public.habit_entries;
notify pgrst, 'reload schema';
