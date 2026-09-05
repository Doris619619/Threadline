-- 文件用途：新增账号隔离的生理期起止记录；旧日期标记原样保留，排他约束防止并发重叠。
create extension if not exists btree_gist with schema extensions;

create table public.period_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint period_date_order check (end_date is null or end_date >= start_date),
  constraint period_no_overlap exclude using gist (
    owner_id extensions.gist_uuid_ops with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (deleted_at is null)
);
alter table public.period_records enable row level security;
create policy "owners read periods" on public.period_records for select to authenticated using (owner_id = auth.uid());
create policy "owners insert periods" on public.period_records for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update periods" on public.period_records for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.period_records from anon, authenticated;
grant select, insert, update on public.period_records to authenticated;
grant all on public.period_records to service_role;

-- 本产品以中国本地业务日校验实际记录，不能通过绕过客户端写入未来日期。
create function private.validate_period_dates() returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if new.start_date > (now() at time zone 'Asia/Shanghai')::date
     or new.end_date > (now() at time zone 'Asia/Shanghai')::date then
    raise exception 'PERIOD_FUTURE_DATE' using errcode = '23514';
  end if;
  return new;
end; $$;
create trigger period_validate_dates before insert or update on public.period_records
for each row execute function private.validate_period_dates();
create trigger period_touch_updated_at before update on public.period_records
for each row execute function private.touch_updated_at();
alter publication supabase_realtime add table public.period_records;
notify pgrst, 'reload schema';
