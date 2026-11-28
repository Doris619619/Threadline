-- 文件用途：将备忘录的业务版本冲突映射为 HTTP 409，避免 PostgREST 对 40001 序列化失败无限重试。
-- 保持原参数、认证、RLS 与版本条件；只改变业务冲突的 SQLSTATE，不改写已有文档。
create or replace function public.save_day_memo(p_date date, p_content jsonb, p_expected_revision bigint, p_expected_owner uuid)
returns public.day_memos language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  actor uuid := auth.uid();
  saved public.day_memos;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_expected_owner is distinct from actor then raise exception 'MEMO_ACCOUNT_CHANGED' using errcode = '28000'; end if;
  if p_date is null or p_expected_revision is null or p_expected_revision < 0 or p_content is null then
    raise exception 'INVALID_MEMO' using errcode = '22023';
  end if;
  if p_expected_revision = 0 then
    insert into public.day_memos(owner_id, memo_date, content) values(actor, p_date, p_content)
    on conflict (owner_id, memo_date) do nothing returning * into saved;
  else
    update public.day_memos set content = p_content, revision = revision + 1, updated_at = now()
    where owner_id = actor and memo_date = p_date and revision = p_expected_revision returning * into saved;
  end if;
  if saved.owner_id is null then raise exception 'MEMO_CONFLICT' using errcode = 'PT409'; end if;
  return saved;
end; $$;
revoke all on function public.save_day_memo(date, jsonb, bigint, uuid) from public, anon;
grant execute on function public.save_day_memo(date, jsonb, bigint, uuid) to authenticated;
