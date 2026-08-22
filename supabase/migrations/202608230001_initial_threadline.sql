create table projects (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  status text not null check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table tasks (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id),
  title text not null check (char_length(trim(title)) between 1 and 200),
  scheduled_date date,
  planned_start_time time,
  planned_end_time time,
  planned_duration_minutes integer check (planned_duration_minutes >= 0),
  actual_duration_minutes integer check (actual_duration_minutes >= 0),
  completed boolean not null default false,
  completed_at timestamptz,
  status text not null check (status in ('active', 'rescheduled', 'backlog', 'abandoned', 'trashed')),
  backlog_importance text check (backlog_importance in ('important', 'not_important')),
  ddl_at timestamptz,
  postponed_from date,
  postponed_to date,
  abandoned_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_end_time is null or planned_start_time is not null),
  check (planned_end_time is null or planned_end_time >= planned_start_time)
);

create table daily_definitions (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id),
  title text not null check (char_length(trim(title)) between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table daily_instances (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  definition_id uuid not null references daily_definitions(id) on delete cascade,
  instance_date date not null,
  completed boolean not null default false,
  actual_duration_minutes integer check (actual_duration_minutes >= 0),
  result text,
  unique(definition_id, instance_date)
);

create table daily_subtasks (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  definition_id uuid not null references daily_definitions(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  position integer not null check (position >= 0)
);

create table daily_subtask_instances (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  instance_id uuid not null references daily_instances(id) on delete cascade,
  subtask_id uuid not null references daily_subtasks(id) on delete cascade,
  completed boolean not null default false,
  unique(instance_id, subtask_id)
);

create table history_events (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  daily_instance_id uuid references daily_instances(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  check (task_id is not null or daily_instance_id is not null)
);

create table daily_close_records (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  close_date date not null,
  closed_at timestamptz not null default now(),
  project_minutes jsonb not null default '{}'::jsonb,
  unique(owner_id, close_date)
);

create index tasks_owner_date_idx on tasks(owner_id, scheduled_date);
create index tasks_owner_status_idx on tasks(owner_id, status);
create index daily_instances_owner_date_idx on daily_instances(owner_id, instance_date);
create index history_events_owner_occurred_idx on history_events(owner_id, occurred_at desc);

alter table projects enable row level security;
alter table tasks enable row level security;
alter table daily_definitions enable row level security;
alter table daily_instances enable row level security;
alter table daily_subtasks enable row level security;
alter table daily_subtask_instances enable row level security;
alter table history_events enable row level security;
alter table daily_close_records enable row level security;

create policy "users manage their projects" on projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their tasks" on tasks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their daily definitions" on daily_definitions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their daily instances" on daily_instances for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their daily subtasks" on daily_subtasks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their daily subtask instances" on daily_subtask_instances for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their history" on history_events for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users manage their close records" on daily_close_records for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
