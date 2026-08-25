-- 文件用途：为任务增加持久化的待填时间排程状态，支持无时间待办拖入日程后跨刷新保留。

alter table tasks
  add column schedule_pending_time boolean not null default false;
