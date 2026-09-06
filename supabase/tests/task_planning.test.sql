-- 文件用途：事务回滚验证提前改期、过去日期拒绝、历史和实际账本不漂移，以及账号隔离。
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
insert into auth.users(id, email) values ('96000000-0000-0000-0000-000000000006', 'planning-test@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000006', true);
select public.initialize_workspace();
insert into public.tasks(id, project_id, title, scheduled_date, status, actual_duration_minutes)
select '96000000-0000-0000-0000-000000000007', id, 'Planning test', current_date + 7, 'active', 35
from public.projects where owner_id = auth.uid() and is_fallback;
select lives_ok($$select public.transition_task('96000000-0000-0000-0000-000000000007', 'rescheduled', current_date, 'UTC')$$, 'Future task can be brought forward to today');
select is((select scheduled_date from public.tasks where id = '96000000-0000-0000-0000-000000000007'), current_date, 'Task date updated');
select is((select postponed_from from public.tasks where id = '96000000-0000-0000-0000-000000000007'), current_date + 7, 'Original date recorded');
select is((select entry_date from public.task_time_entries where task_id = '96000000-0000-0000-0000-000000000007' limit 1), current_date + 7, 'Actual time stays on original date');
select is((select payload->>'fromDate' from public.history_events where task_id = '96000000-0000-0000-0000-000000000007' and event_type = 'rescheduled' limit 1), (current_date + 7)::text, 'History records original date');
select throws_ok($$select public.transition_task('96000000-0000-0000-0000-000000000007', 'rescheduled', current_date - 1, 'UTC')$$, '22023', 'INVALID_TARGET_DATE', 'Past target rejected');
select throws_ok($$select public.transition_task('96000000-0000-0000-0000-000000000007', 'rescheduled', current_date, 'UTC')$$, '22023', 'INVALID_TARGET_DATE', 'Same target rejected');
select lives_ok($$select public.transition_task('96000000-0000-0000-0000-000000000007', 'rescheduled', current_date + 3, 'UTC')$$, 'Task can still move later');
update public.tasks set completed = true where id = '96000000-0000-0000-0000-000000000007';
select throws_ok($$select public.transition_task('96000000-0000-0000-0000-000000000007', 'rescheduled', current_date + 1, 'UTC')$$, '23514', 'COMPLETED_TASK_TRANSITION', 'Completed task cannot be rescheduled');
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000008', true);
select throws_ok($$select public.transition_task('96000000-0000-0000-0000-000000000007', 'rescheduled', current_date + 1, 'UTC')$$, 'P0002', 'TASK_NOT_FOUND', 'Other owner cannot reschedule task');
select * from finish();
rollback;
