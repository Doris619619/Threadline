-- 文件用途：独立存储每日富文本备忘录，按账号隔离，版本检查阻止跨设备陈旧覆盖，不参与任务或计时统计。
create table public.day_memos (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  memo_date date not null,
  content jsonb not null check ((jsonb_typeof(content) = 'object' and content->>'type' = 'doc' and jsonb_typeof(content->'content') = 'array' and octet_length(content::text) <= 800000) is true),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, memo_date)
);
alter table public.day_memos enable row level security;
create policy day_memos_owner_read on public.day_memos for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.day_memos from public, anon, authenticated;
grant select on public.day_memos to authenticated;
grant all on public.day_memos to service_role;

-- 写入必须经带版本条件的命令；预期账号仅用于拒绝换号后的旧队列，实际 owner_id 仍取认证上下文。
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
  if saved.owner_id is null then raise exception 'MEMO_CONFLICT' using errcode = '40001'; end if;
  return saved;
end; $$;
revoke all on function public.save_day_memo(date, jsonb, bigint, uuid) from public, anon;
grant execute on function public.save_day_memo(date, jsonb, bigint, uuid) to authenticated;
