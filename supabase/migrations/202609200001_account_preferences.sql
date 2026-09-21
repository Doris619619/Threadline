-- 文件用途：增加账号性别与一次性引导状态；保留旧客户端及全部节律历史。
alter table public.workspace_profiles
  add column gender text check (gender in ('male', 'female')),
  add column onboarding_completed_at timestamptz,
  add column preferences_version integer not null default 0,
  add constraint onboarding_requires_gender check (onboarding_completed_at is null or gender is not null);

-- initialize_workspace 的 invoker 插入只需要 owner_id，不能通过直接 INSERT 伪造完成状态。
revoke insert on public.workspace_profiles from authenticated;
grant insert(owner_id) on public.workspace_profiles to authenticated;

-- 只允许通过当前账号 RPC 修改偏好；预期版本防止跨设备覆盖，重复提交可安全重试。
create function public.save_account_preferences(p_gender text, p_complete boolean, p_expected_version integer)
returns public.workspace_profiles language plpgsql security definer set search_path = pg_catalog, public as $$
declare owner uuid := auth.uid(); profile public.workspace_profiles; next_gender text;
begin
  if owner is null then raise exception 'PREFERENCES_AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_complete is null or p_expected_version is null or (p_gender is not null and p_gender not in ('male', 'female')) then
    raise exception 'PREFERENCES_INVALID_INPUT' using errcode = '23514';
  end if;
  select * into strict profile from public.workspace_profiles where owner_id = owner for update;
  next_gender := coalesce(p_gender, profile.gender);
  if p_complete and next_gender is null then raise exception 'PREFERENCES_GENDER_REQUIRED' using errcode = '23514'; end if;
  if profile.preferences_version <> p_expected_version then
    if next_gender is not distinct from profile.gender and (not p_complete or profile.onboarding_completed_at is not null) then return profile; end if;
    raise exception 'PREFERENCES_CONFLICT' using errcode = '40001';
  end if;
  update public.workspace_profiles set gender = next_gender,
    onboarding_completed_at = case when p_complete then coalesce(onboarding_completed_at, clock_timestamp()) else onboarding_completed_at end,
    preferences_version = preferences_version + 1
    where owner_id = owner returning * into profile;
  return profile;
end; $$;
revoke all on function public.save_account_preferences(text,boolean,integer) from public, anon, authenticated;
grant execute on function public.save_account_preferences(text,boolean,integer) to authenticated;
alter publication supabase_realtime add table public.workspace_profiles;
notify pgrst, 'reload schema';
