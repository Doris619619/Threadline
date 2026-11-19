-- 文件用途：保存按账号隔离的 DeepSeek 加密凭据，仅 Edge 服务端角色可以访问，不对客户端或 Realtime 公开。

create table public.account_ai_credentials (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'deepseek' check (provider = 'deepseek'),
  encrypted_key text not null check (
    char_length(encrypted_key) between 24 and 4096
    and encrypted_key ~ '^[A-Za-z0-9+/]+={0,2}$'
  ),
  iv text not null check (iv ~ '^[A-Za-z0-9+/]{16}$'),
  version smallint not null default 1 check (version = 1),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.account_ai_credentials enable row level security;
revoke all privileges on table public.account_ai_credentials from public, anon, authenticated;
grant select, insert, update, delete on table public.account_ai_credentials to service_role;

comment on table public.account_ai_credentials is 'Edge-only AES-GCM encrypted DeepSeek credentials; never store or return plaintext API keys.';
notify pgrst, 'reload schema';
