-- 文件用途：显式授予登录客户端运行 Threadline Repository/RPC 所需的最小 PostgreSQL 权限。

grant usage on schema public to authenticated;

revoke all privileges on table
  public.workspace_profiles,
  public.projects,
  public.tasks,
  public.daily_templates,
  public.daily_template_items,
  public.daily_entries,
  public.daily_entry_items,
  public.daily_history_entries,
  public.history_events,
  public.daily_close_records,
  public.workstation_entries,
  public.rhythm_marks
from public, anon, authenticated;

grant select, insert on table public.workspace_profiles to authenticated;
grant select, insert, update on table public.projects to authenticated;
grant select, insert, update on table public.tasks to authenticated;
grant select, insert on table public.daily_templates to authenticated;
grant select, insert on table public.daily_template_items to authenticated;
grant select, insert, update on table public.daily_entries to authenticated;
grant select, insert, update on table public.daily_entry_items to authenticated;
grant select, insert on table public.daily_history_entries to authenticated;
grant select, insert on table public.history_events to authenticated;
grant select, insert, update on table public.daily_close_records to authenticated;
grant select, insert, update on table public.workstation_entries to authenticated;
grant select, insert, update on table public.rhythm_marks to authenticated;

-- Threadline 当前所有业务主键都是 UUID，不需要客户端 sequence；显式清空默认继承权限。
revoke all privileges on all sequences in schema public from public, anon, authenticated;

revoke all privileges on function public.initialize_workspace()
from public, anon, authenticated;
revoke all privileges on function public.ensure_daily_entries_for_date(date)
from public, anon, authenticated;
revoke all privileges on function public.record_daily_history(uuid, date, text)
from public, anon, authenticated;
revoke all privileges on function public.create_daily_template_with_entry(uuid, uuid, text, date)
from public, anon, authenticated;
revoke all privileges on function public.transition_task(uuid, text, date)
from public, anon, authenticated;
revoke all privileges on function public.add_workstation_task(uuid)
from public, anon, authenticated;
revoke all privileges on function public.reorder_workstation(uuid[])
from public, anon, authenticated;
revoke all privileges on function public.close_day(date, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.initialize_workspace() to authenticated;
grant execute on function public.ensure_daily_entries_for_date(date) to authenticated;
grant execute on function public.record_daily_history(uuid, date, text) to authenticated;
grant execute on function public.create_daily_template_with_entry(uuid, uuid, text, date) to authenticated;
grant execute on function public.transition_task(uuid, text, date) to authenticated;
grant execute on function public.add_workstation_task(uuid) to authenticated;
grant execute on function public.reorder_workstation(uuid[]) to authenticated;
grant execute on function public.close_day(date, jsonb, jsonb) to authenticated;

-- Production purge 始终只允许数据库受信任上下文执行。
revoke all privileges on function private.purge_expired_tasks() from public;
revoke all privileges on function private.purge_expired_tasks() from anon;
revoke all privileges on function private.purge_expired_tasks() from authenticated;
