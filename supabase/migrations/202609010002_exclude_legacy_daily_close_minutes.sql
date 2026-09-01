-- 文件用途：从旧版关账项目汇总中审计并剥离已知 Daily 实际，保留任务与项目历史账本。

-- 旧版 capture trigger 会把 Daily 父子实际按当时项目归属混入 project_minutes。
-- 此审计表记录每个被剥离的可验证 Daily 分量，避免删除 close record 或丢失其余任务历史。
create table if not exists public.daily_close_record_daily_exclusions (
  close_record_id uuid not null references public.daily_close_records(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  daily_minutes integer not null check (daily_minutes > 0),
  migrated_at timestamptz not null default now(),
  primary key (close_record_id, project_id)
);

alter table public.daily_close_record_daily_exclusions enable row level security;

/**
 * 仅修复能由同日不可变任务 ledger 和 legacy Daily snapshot 双重核对的旧 close record。
 * 优先使用 formal daily_history_entries；没有 history 的旧工作区才回退到可变 daily_entries。
 * 已是 task-only 的新记录保持原值；任何无法保留任务残差的损坏记录直接中止迁移，拒绝静默丢数据。
 */
create or replace function private.exclude_legacy_daily_close_minutes()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  allocation record;
  raw_minutes_text text;
  raw_minutes integer;
  repaired_count integer := 0;
begin
  for allocation in
    with daily_sources as (
      -- Formal history is the immutable close-time fact, including when a later entry edit differs.
      select
        closes.id as close_record_id,
        closes.owner_id,
        closes.close_date,
        history.legacy_project_id as project_id,
        history.actual_duration_minutes as daily_minutes
      from public.daily_close_records as closes
      join public.daily_history_entries as history
        on history.owner_id = closes.owner_id and history.entry_date = closes.close_date
      where history.legacy_project_id is not null

      union all

      -- Legacy workspaces without a formal snapshot retain the prior entry-based compatibility path.
      select
        closes.id as close_record_id,
        closes.owner_id,
        closes.close_date,
        entries.legacy_project_id as project_id,
        entries.actual_duration_minutes
          + coalesce((
            select sum(items.actual_duration_minutes)
            from public.daily_entry_items as items
            where items.owner_id = entries.owner_id and items.entry_id = entries.id
          ), 0) as daily_minutes
      from public.daily_close_records as closes
      join public.daily_entries as entries
        on entries.owner_id = closes.owner_id and entries.entry_date = closes.close_date
      where entries.legacy_project_id is not null
        and not exists (
          select 1
          from public.daily_history_entries as history
          where history.owner_id = entries.owner_id
            and history.template_id = entries.template_id
            and history.entry_date = entries.entry_date
        )
    )
    select
      sources.close_record_id,
      sources.owner_id,
      sources.close_date,
      sources.project_id,
      sum(sources.daily_minutes)::integer as daily_minutes,
      coalesce((
        select sum(times.minutes)::integer
        from public.task_time_entries as times
        where times.owner_id = sources.owner_id
          and times.entry_date = sources.close_date
          and times.project_id = sources.project_id
      ), 0) as task_minutes
    from daily_sources as sources
    left join public.daily_close_record_daily_exclusions as exclusions
      on exclusions.close_record_id = sources.close_record_id
      and exclusions.project_id = sources.project_id
    where exclusions.close_record_id is null
    group by sources.close_record_id, sources.owner_id, sources.close_date, sources.project_id
    having sum(sources.daily_minutes) > 0
  loop
    select records.project_minutes ->> allocation.project_id::text
    into raw_minutes_text
    from public.daily_close_records as records
    where records.id = allocation.close_record_id;

    -- 新模型的 close record 已只含 task ledger；没有该 project key 也是合法的 Daily-only 日期。
    if raw_minutes_text is null and allocation.task_minutes = 0 then
      continue;
    end if;
    if raw_minutes_text is null or raw_minutes_text !~ '^\d+$' then
      raise exception 'LEGACY_CLOSE_RECORD_DAILY_TOTAL_MISMATCH'
        using errcode = '22023',
          detail = format('close=%s project=%s has no integer total', allocation.close_record_id, allocation.project_id);
    end if;
    raw_minutes := raw_minutes_text::integer;
    if raw_minutes = allocation.task_minutes then
      continue;
    end if;
    if raw_minutes < allocation.task_minutes + allocation.daily_minutes then
      raise exception 'LEGACY_CLOSE_RECORD_DAILY_TOTAL_MISMATCH'
        using errcode = '22023',
          detail = format(
            'close=%s project=%s raw=%s task=%s daily=%s',
            allocation.close_record_id,
            allocation.project_id,
            raw_minutes,
            allocation.task_minutes,
            allocation.daily_minutes
          );
    end if;

    update public.daily_close_records
    set project_minutes = project_minutes || jsonb_build_object(
      allocation.project_id::text,
      raw_minutes - allocation.daily_minutes
    )
    where id = allocation.close_record_id;
    insert into public.daily_close_record_daily_exclusions(
      close_record_id, owner_id, project_id, daily_minutes
    ) values (
      allocation.close_record_id, allocation.owner_id, allocation.project_id, allocation.daily_minutes
    );
    repaired_count := repaired_count + 1;
  end loop;
  return repaired_count;
end;
$$;

-- repair 写入的是经过双重核对的历史 snapshot；在这一小段迁移窗口保留它，
-- 随后立即恢复新 close record 的 server-derived 防伪 trigger。若 repair 抛错，
-- Supabase migration 事务会一并回滚这两个 DDL，不会留下未受保护的表。
alter table public.daily_close_records
  disable trigger daily_close_capture_project_minutes;
select private.exclude_legacy_daily_close_minutes();
alter table public.daily_close_records
  enable trigger daily_close_capture_project_minutes;

revoke all on table public.daily_close_record_daily_exclusions from public, anon, authenticated;
revoke all on function private.exclude_legacy_daily_close_minutes() from public, anon, authenticated;
