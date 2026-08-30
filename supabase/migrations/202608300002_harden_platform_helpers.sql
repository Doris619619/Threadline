-- 文件用途：收紧 Supabase 平台创建的 public SECURITY DEFINER helper 权限，避免通过 Data API 调用。

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
