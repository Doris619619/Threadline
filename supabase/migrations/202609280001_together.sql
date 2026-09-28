-- 文件用途：新增两人空间、邀请、flag、微信成果声明；所有状态写入由鉴权、幂等 RPC 完成。
create table public.together_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30)
);
create table public.together_rooms (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id), user_b uuid not null references auth.users(id),
  name_a text not null, name_b text not null, nickname_a text, nickname_b text,
  relationship text not null check (relationship in ('friends','couple')),
  proposed_relationship text check (proposed_relationship in ('friends','couple')),
  proposed_by uuid, affection integer not null default 0,
  version integer not null default 1, created_at timestamptz not null default now(), ended_at timestamptz,
  check (user_a <> user_b)
);
create table public.together_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  room_id uuid not null references public.together_rooms(id)
);
create table public.together_invites (
  id uuid primary key default gen_random_uuid(), creator uuid not null references auth.users(id),
  code text not null unique default upper(replace(gen_random_uuid()::text,'-','')),
  relationship text not null check (relationship in ('friends','couple')),
  expires_at timestamptz not null default now() + interval '24 hours', revoked boolean not null default false
);
create table public.together_flags (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references public.together_rooms(id),
  owner_id uuid not null references auth.users(id), title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  reward text not null default '' check (char_length(reward) <= 200),
  deadline timestamptz not null, timezone text not null,
  status text not null default 'active' check (status in ('active','submitted','changes','completed','cancelled')),
  version integer not null default 1, first_submitted_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), cancelled_reason text
);
create index together_flags_room_date on public.together_flags(room_id, created_at desc, id);
create index together_rooms_a on public.together_rooms(user_a);
create index together_rooms_b on public.together_rooms(user_b);
create table public.together_events (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references public.together_rooms(id),
  flag_id uuid references public.together_flags(id), actor uuid not null references auth.users(id),
  kind text not null check (kind in ('created','edited','submitted','changes','approved','cancelled','cheered','surprise','nickname','relationship','ended')),
  body text not null default '' check (char_length(body) <= 1000),
  points integer not null default 0 check (points between 0 and 1),
  created_at timestamptz not null default now()
);
create unique index together_once_event on public.together_events(flag_id,kind) where kind in ('approved','cheered','surprise');
create index together_events_flag on public.together_events(flag_id,created_at);
create table public.together_requests (
  actor uuid not null references auth.users(id), request_id uuid not null,
  input jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key(actor,request_id)
);

-- 成员校验避免策略递归；固定 search_path，普通用户不可读取其他空间。
create function private.together_member(p_room uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.together_rooms where id=p_room and auth.uid() in (user_a,user_b));
$$;
grant usage on schema private to authenticated;
revoke all on function private.together_member(uuid) from public, anon;
grant execute on function private.together_member(uuid) to authenticated;

alter table public.together_profiles enable row level security;
alter table public.together_rooms enable row level security;
alter table public.together_memberships enable row level security;
alter table public.together_invites enable row level security;
alter table public.together_flags enable row level security;
alter table public.together_events enable row level security;
alter table public.together_requests enable row level security;
create policy together_profile_read on public.together_profiles for select to authenticated using (user_id=auth.uid());
create policy together_room_read on public.together_rooms for select to authenticated using (auth.uid() in (user_a,user_b));
create policy together_membership_read on public.together_memberships for select to authenticated using (user_id=auth.uid());
create policy together_invite_read on public.together_invites for select to authenticated using (creator=auth.uid());
create policy together_flag_read on public.together_flags for select to authenticated using (private.together_member(room_id));
create policy together_event_read on public.together_events for select to authenticated using (private.together_member(room_id));
create policy together_request_read on public.together_requests for select to authenticated using (actor=auth.uid());
revoke all on public.together_profiles, public.together_rooms, public.together_memberships, public.together_invites, public.together_flags, public.together_events, public.together_requests from anon, authenticated;
grant select on public.together_profiles, public.together_rooms, public.together_memberships, public.together_invites, public.together_flags, public.together_events, public.together_requests to authenticated;
grant all on public.together_profiles, public.together_rooms, public.together_memberships, public.together_invites, public.together_flags, public.together_events, public.together_requests to service_role;

-- 邀请预览只接受高熵邀请码，不提供邮箱或用户搜索。
create function public.together_preview_invite(p_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.together_invites;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into i from public.together_invites where code=upper(btrim(p_code)) and not revoked and expires_at>now();
  if not found then raise exception 'INVITE_INVALID'; end if;
  if i.creator=auth.uid() then raise exception 'INVITE_SELF'; end if;
  if exists(select 1 from public.together_memberships where user_id in (auth.uid(),i.creator)) then raise exception 'ALREADY_BOUND'; end if;
  return jsonb_build_object('id',i.id,'name',(select display_name from public.together_profiles where user_id=i.creator),'relationship',i.relationship);
end;
$$;

-- 邀请与绑定共用事务锁，保证并行接受和解除关系不会留下半个绑定。
create function private.together_binding(p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); i public.together_invites; r public.together_rooms; display text;
begin
  perform pg_advisory_xact_lock(hashtextextended('together-bindings',0));
  if p_action='profile' then
    display := btrim(p->>'name');
    if display is null or char_length(display) not between 1 and 30 or display like '%@%' then raise exception 'NAME_INVALID'; end if;
    insert into public.together_profiles values(me,display) on conflict(user_id) do update set display_name=excluded.display_name;
    return jsonb_build_object('saved',true);
  end if;
  if p_action='revoke_invite' then
    update public.together_invites set revoked=true where id=(p->>'id')::uuid and creator=me;
    return jsonb_build_object('saved',true);
  end if;
  if exists(select 1 from public.together_memberships where user_id=me) then raise exception 'ALREADY_BOUND'; end if;
  if not exists(select 1 from public.together_profiles where user_id=me) then raise exception 'NAME_REQUIRED'; end if;
  if p_action='invite' then
    update public.together_invites set revoked=true where creator=me and not revoked;
    insert into public.together_invites(creator,relationship) values(me,p->>'relationship') returning * into i;
    return to_jsonb(i);
  end if;
  select * into i from public.together_invites where id=(p->>'id')::uuid and not revoked and expires_at>now() for update;
  if not found then raise exception 'INVITE_INVALID'; end if;
  if i.creator=me then raise exception 'INVITE_SELF'; end if;
  if exists(select 1 from public.together_memberships where user_id=i.creator) then raise exception 'ALREADY_BOUND'; end if;
  insert into public.together_rooms(user_a,user_b,name_a,name_b,relationship)
    values(i.creator,me,(select display_name from public.together_profiles where user_id=i.creator),
      (select display_name from public.together_profiles where user_id=me),i.relationship) returning * into r;
  insert into public.together_memberships values(i.creator,r.id),(me,r.id);
  update public.together_invites set revoked=true where creator in (me,i.creator);
  return to_jsonb(r);
end;
$$;

-- 空间设置只改当前成员可改字段；关系切换需另一成员确认，解除保留只读历史。
create function private.together_room_command(p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.together_rooms; me uuid := auth.uid(); v text;
begin
  if p_action='end_room' then perform pg_advisory_xact_lock(hashtextextended('together-bindings',0)); end if;
  select * into r from public.together_rooms where id=(p->>'room_id')::uuid for update;
  if not found or me not in (r.user_a,r.user_b) then raise exception 'FORBIDDEN'; end if;
  if r.ended_at is not null then raise exception 'ROOM_ENDED'; end if;
  if (p->>'version')::integer is distinct from r.version then raise exception 'VERSION_CONFLICT'; end if;
  if p_action='settings' then
    v := btrim(p->>'name');
    if v is null or char_length(v) not between 1 and 30 or v like '%@%' then raise exception 'NAME_INVALID'; end if;
    if char_length(coalesce(p->>'nickname',''))>30 then raise exception 'NAME_INVALID'; end if;
    update public.together_profiles set display_name=v where user_id=me;
    update public.together_rooms set
      name_a=case when user_a=me then v else name_a end,
      name_b=case when user_b=me then v else name_b end,
      nickname_b=case when user_a=me then nullif(btrim(p->>'nickname'),'') else nickname_b end,
      nickname_a=case when user_b=me then nullif(btrim(p->>'nickname'),'') else nickname_a end where id=r.id;
    insert into public.together_events(room_id,actor,kind,body) values(r.id,me,'nickname','更新了空间里的称呼');
  elsif p_action='reset_nickname' then
    update public.together_rooms set nickname_a=case when user_a=me then null else nickname_a end,
      nickname_b=case when user_b=me then null else nickname_b end where id=r.id;
  elsif p_action='propose_relationship' then
    if p->>'relationship' is null or p->>'relationship' not in ('friends','couple') or p->>'relationship'=r.relationship then raise exception 'INVALID_RELATIONSHIP'; end if;
    update public.together_rooms set proposed_relationship=p->>'relationship',proposed_by=me where id=r.id;
  elsif p_action='answer_relationship' then
    if r.proposed_by is null or r.proposed_by=me then raise exception 'FORBIDDEN'; end if;
    update public.together_rooms set relationship=case when (p->>'accept')::boolean then proposed_relationship else relationship end,
      proposed_relationship=null,proposed_by=null where id=r.id;
    insert into public.together_events(room_id,actor,kind,body) values(r.id,me,'relationship',case when (p->>'accept')::boolean then '确认了新的关系' else '保留现在的关系' end);
  elsif p_action='end_room' then
    update public.together_rooms set ended_at=now(),proposed_relationship=null,proposed_by=null where id=r.id;
    update public.together_flags set status='cancelled',cancelled_reason='关系已结束',version=version+1 where room_id=r.id and status not in ('completed','cancelled');
    delete from public.together_memberships where room_id=r.id;
    insert into public.together_events(room_id,actor,kind,body) values(r.id,me,'ended','关系已结束，记录仅原成员可见');
  else raise exception 'UNKNOWN_ACTION'; end if;
  update public.together_rooms set version=version+1 where id=r.id returning * into r;
  return to_jsonb(r);
end;
$$;

-- Flag 状态机持有空间锁与 flag 锁，验收、事件和好感度一次提交。
create function private.together_flag_command(p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.together_rooms; f public.together_flags; me uuid := auth.uid(); e uuid; k text; body text:=coalesce(p->>'body',''); pts integer:=0;
begin
  select * into r from public.together_rooms where id=(p->>'room_id')::uuid for update;
  if not found or me not in (r.user_a,r.user_b) then raise exception 'FORBIDDEN'; end if;
  if r.ended_at is not null then raise exception 'ROOM_ENDED'; end if;
  if p_action in ('create_flag','edit_flag') then
    if not exists(select 1 from pg_timezone_names where name=p->>'timezone') then raise exception 'INVALID_TIMEZONE'; end if;
  end if;
  if p_action='create_flag' then
    insert into public.together_flags(room_id,owner_id,title,description,reward,deadline,timezone)
      values(r.id,me,btrim(p->>'title'),coalesce(p->>'description',''),coalesce(p->>'reward',''),(p->>'deadline')::timestamptz,p->>'timezone') returning * into f;
    k:='created';
  else
    select * into f from public.together_flags where id=(p->>'flag_id')::uuid and room_id=r.id for update;
    if not found then raise exception 'FORBIDDEN'; end if;
    if (p->>'version')::integer is distinct from f.version then raise exception 'VERSION_CONFLICT'; end if;
    if p_action in ('edit_flag','cancel_flag','submit') and f.owner_id<>me then raise exception 'FORBIDDEN'; end if;
    if p_action in ('approve','changes','cheer','surprise') and f.owner_id=me then raise exception 'SELF_REVIEW'; end if;
    if p_action='edit_flag' then
      if f.first_submitted_at is not null or f.status<>'active' then raise exception 'FLAG_LOCKED'; end if;
      update public.together_flags set title=btrim(p->>'title'),description=coalesce(p->>'description',''),reward=coalesce(p->>'reward',''),deadline=(p->>'deadline')::timestamptz where id=f.id;
      k:='edited'; body:='修改了目标或约定';
    elsif p_action='cancel_flag' then
      if f.status in ('completed','cancelled') then raise exception 'INVALID_STATE'; end if;
      update public.together_flags set status='cancelled',cancelled_reason='执行人取消' where id=f.id; k:='cancelled';
    elsif p_action='submit' then
      if f.status not in ('active','changes') then raise exception 'INVALID_STATE'; end if;
      update public.together_flags set status='submitted',first_submitted_at=coalesce(first_submitted_at,now()) where id=f.id; k:='submitted';
    elsif p_action in ('approve','changes') then
      if f.status<>'submitted' then raise exception 'INVALID_STATE'; end if;
      if p_action='changes' and btrim(body)='' then raise exception 'REASON_REQUIRED'; end if;
      update public.together_flags set status=case when p_action='approve' then 'completed' else 'changes' end,
        completed_at=case when p_action='approve' then now() else null end where id=f.id;
      k:=case when p_action='approve' then 'approved' else 'changes' end;
    elsif p_action='cheer' then
      if f.status in ('completed','cancelled') then raise exception 'INVALID_STATE'; end if; k:='cheered';
    elsif p_action='surprise' then
      if f.status<>'completed' then raise exception 'INVALID_STATE'; end if; k:='surprise';
    else raise exception 'UNKNOWN_ACTION'; end if;
    update public.together_flags set version=version+1 where id=f.id;
  end if;
  if k in ('cheered','approved','surprise') and r.relationship='couple' then pts:=1; end if;
  insert into public.together_events(room_id,flag_id,actor,kind,body,points) values(r.id,f.id,me,k,body,pts) returning id into e;
  if k='submitted' and coalesce((p->>'wechat_sent')::boolean,false) is not true then raise exception 'WECHAT_REQUIRED'; end if;
  if k='surprise' and btrim(body)='' then raise exception 'REASON_REQUIRED'; end if;
  update public.together_rooms set affection=affection+pts,version=version+1 where id=r.id;
  select * into f from public.together_flags where id=f.id;
  return jsonb_build_object('flag',to_jsonb(f),'points',pts,'event_id',e);
end;
$$;

-- 唯一写入口：请求 ID 和原始输入绑定；未知结果可查询或原样重试，绝不重复计分。
create function public.together_command(p_request_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid:=auth.uid(); old public.together_requests; result jsonb; input jsonb:=jsonb_build_object('action',p_action,'payload',p_payload);
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text||p_request_id::text,0));
  select * into old from public.together_requests where actor=me and request_id=p_request_id;
  if found then
    if old.input<>input then raise exception 'REQUEST_REUSED'; end if;
    return old.result;
  end if;
  if p_action in ('profile','invite','accept_invite','revoke_invite') then result:=private.together_binding(p_action,p_payload);
  elsif p_action in ('settings','reset_nickname','propose_relationship','answer_relationship','end_room') then result:=private.together_room_command(p_action,p_payload);
  else result:=private.together_flag_command(p_action,p_payload); end if;
  insert into public.together_requests(actor,request_id,input,result) values(me,p_request_id,input,result);
  return result;
end;
$$;
revoke all on function private.together_binding(text,jsonb),private.together_room_command(text,jsonb),private.together_flag_command(text,jsonb) from public,anon,authenticated;
revoke all on function public.together_command(uuid,text,jsonb),public.together_preview_invite(text) from public,anon;
grant execute on function public.together_command(uuid,text,jsonb),public.together_preview_invite(text) to authenticated;

-- 只发布空间新增/更新所需的轻量表；成员表解除时物理删除，不发布删除中的账号主键。
-- 空间由 ended_at 软结束，普通成员没有物理删除入口。
alter publication supabase_realtime add table public.together_rooms;
