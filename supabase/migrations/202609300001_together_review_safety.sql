-- 文件用途：绑定具体成果验收并限制截止时间范围；追加迁移保留已安装版本的数据。
alter table public.together_flags add column current_submission_id uuid references public.together_events(id);

-- 保留历史并回填最近声明；没有成果的异常旧记录保持空值，RPC 拒绝验收。
update public.together_flags f set current_submission_id=(
  select e.id from public.together_events e where e.flag_id=f.id and e.kind='submitted'
  order by e.created_at desc,e.id desc limit 1
);

-- NOT VALID 不重写或阻断旧异常记录的迁移；所有新增和更新立即执行检查。
alter table public.together_flags add constraint together_deadline_supported
  check (isfinite(deadline) and deadline >= timestamptz '1900-01-01 00:00:00+00'
    and deadline < timestamptz '10000-01-01 00:00:00+00') not valid;

-- 同一校验用于创建与编辑，返回可修正的业务错误；表约束保护其他写入路径。
create or replace function private.together_flag_command(p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.together_rooms; f public.together_flags; me uuid := auth.uid(); e uuid; k text; body text:=coalesce(p->>'body',''); pts integer:=0; due timestamptz;
begin
  select * into r from public.together_rooms where id=(p->>'room_id')::uuid for update;
  if not found or me not in (r.user_a,r.user_b) then raise exception 'FORBIDDEN'; end if;
  if r.ended_at is not null then raise exception 'ROOM_ENDED'; end if;
  if p_action in ('create_flag','edit_flag') then
    begin
      due := (p->>'deadline')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'INVALID_DEADLINE';
    end;
    if due is null or not isfinite(due) or due < timestamptz '1900-01-01 00:00:00+00' or due >= timestamptz '10000-01-01 00:00:00+00' then
      raise exception 'INVALID_DEADLINE';
    end if;
    if not exists(select 1 from pg_timezone_names where name=p->>'timezone') then raise exception 'INVALID_TIMEZONE'; end if;
  end if;
  if p_action='create_flag' then
    insert into public.together_flags(room_id,owner_id,title,description,reward,deadline,timezone)
      values(r.id,me,btrim(p->>'title'),coalesce(p->>'description',''),coalesce(p->>'reward',''),due,p->>'timezone') returning * into f;
    k:='created';
  else
    select * into f from public.together_flags where id=(p->>'flag_id')::uuid and room_id=r.id for update;
    if not found then raise exception 'FORBIDDEN'; end if;
    if (p->>'version')::integer is distinct from f.version then raise exception 'VERSION_CONFLICT'; end if;
    if p_action in ('edit_flag','cancel_flag','submit') and f.owner_id<>me then raise exception 'FORBIDDEN'; end if;
    if p_action in ('approve','changes','cheer','surprise') and f.owner_id=me then raise exception 'SELF_REVIEW'; end if;
    if p_action='edit_flag' then
      if f.first_submitted_at is not null or f.status<>'active' then raise exception 'FLAG_LOCKED'; end if;
      update public.together_flags set title=btrim(p->>'title'),description=coalesce(p->>'description',''),reward=coalesce(p->>'reward',''),deadline=due where id=f.id;
      k:='edited'; body:='修改了目标或约定';
    elsif p_action='cancel_flag' then
      if f.status in ('completed','cancelled') then raise exception 'INVALID_STATE'; end if;
      update public.together_flags set status='cancelled',cancelled_reason='执行人取消' where id=f.id; k:='cancelled';
    elsif p_action='submit' then
      if f.status not in ('active','changes') then raise exception 'INVALID_STATE'; end if;
      update public.together_flags set status='submitted',first_submitted_at=coalesce(first_submitted_at,now()) where id=f.id; k:='submitted';
    elsif p_action in ('approve','changes') then
      if f.status<>'submitted' then raise exception 'INVALID_STATE'; end if;
      if f.current_submission_id is null or (p->>'expected_submission_id')::uuid is distinct from f.current_submission_id then raise exception 'SUBMISSION_CONFLICT'; end if;
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
  if k='submitted' then
    update public.together_flags set current_submission_id=e where id=f.id;
  end if;
  if k='submitted' and coalesce((p->>'wechat_sent')::boolean,false) is not true then raise exception 'WECHAT_REQUIRED'; end if;
  if k='surprise' and btrim(body)='' then raise exception 'REASON_REQUIRED'; end if;
  update public.together_rooms set affection=affection+pts,version=version+1 where id=r.id;
  select * into f from public.together_flags where id=f.id;
  return jsonb_build_object('flag',to_jsonb(f),'points',pts,'event_id',e);
end;
$$;
