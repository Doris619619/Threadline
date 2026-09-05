-- 文件用途：在原子保存 Daily 父子状态时落实任一子项完成即当天完成，不回写旧历史。

create or replace function public.save_daily_entry_bundle(
  p_entry_id uuid, p_title text, p_completed boolean, p_actual_duration_minutes integer,
  p_result text, p_items jsonb
) returns public.daily_entries language plpgsql security definer
set search_path = pg_catalog, public as $$
declare current_owner uuid := auth.uid(); saved public.daily_entries;
begin
  if current_owner is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if char_length(trim(p_title)) not between 1 and 200
    or coalesce(p_actual_duration_minutes, 0) < 0
    or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
    or exists (select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
      as i(id uuid, title text, actual integer)
      where char_length(trim(coalesce(i.title, ''))) not between 1 and 200 or coalesce(i.actual, 0) < 0)
  then raise exception 'INVALID_DAILY_ENTRY' using errcode = '22023'; end if;
  update public.daily_entries set title_snapshot = trim(p_title), completed = p_completed,
    actual_duration_minutes = coalesce(p_actual_duration_minutes, 0), result = coalesce(p_result, '')
  where id = p_entry_id and owner_id = current_owner returning * into saved;
  if saved.id is null then raise exception 'DAILY_ENTRY_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(id uuid)
    join public.daily_entry_items existing on existing.id = i.id
    where existing.owner_id <> current_owner or existing.entry_id <> p_entry_id)
  then raise exception 'DAILY_ENTRY_ITEM_SCOPE_MISMATCH' using errcode = '22023'; end if;
  update public.daily_entry_items set title_snapshot = trim(i.title), completed = coalesce(i.completed, false),
    actual_duration_minutes = coalesce(i.actual, 0)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
    as i(id uuid, title text, completed boolean, actual integer)
  where daily_entry_items.id = i.id and daily_entry_items.owner_id = current_owner
    and daily_entry_items.entry_id = p_entry_id;
  -- 父级直接打卡或任意已存子项完成都算当天完成，旧客户端也不能写入矛盾状态。
  update public.daily_entries set completed = coalesce(p_completed, false) or exists (
    select 1 from public.daily_entry_items
    where entry_id = p_entry_id and owner_id = current_owner and completed
  ) where id = p_entry_id and owner_id = current_owner returning * into saved;
  return saved;
end; $$;

notify pgrst, 'reload schema';

