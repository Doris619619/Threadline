/** @fileoverview 建立请求独立的 Supabase 用户/管理客户端，项目查询始终使用用户 RLS。 */

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import type { AiCredentialStore, EncryptedAiCredential } from './ai-credentials.ts';

/** 每次请求建立独立用户作用域客户端，不跨请求共享 JWT。 */
export function userClient(authorization: string, signal: AbortSignal) {
  const url = Deno.env.get('SUPABASE_URL');
  const key =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('missing_supabase_configuration');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: authorization },
      /** 认证与 RLS 查询均服从处理器的超时/取消。 */
      fetch: (input, init) => fetch(input, { ...init, signal }),
    },
  });
}

/** 用 Auth 服务确认用户身份，不把未经验证的 JWT payload 当成 owner。 */
export async function authenticateAiUser(
  authorization: string,
  signal: AbortSignal,
): Promise<string | null> {
  const { data, error } = await userClient(authorization, signal).auth.getUser(
    authorization.replace(/^Bearer\s+/i, ''),
  );
  return error ? null : (data.user?.id ?? null);
}

/** 仅为私密凭据表建立管理客户端；绝不将它用于任务或项目查询。 */
function credentialClient(signal: AbortSignal) {
  const url = Deno.env.get('SUPABASE_URL');
  const key =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (!url || !key) throw new Error('missing_credential_storage');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      /** 管理请求也服从业务 deadline，且不会持久化会话。 */
      fetch: (input, init) => fetch(input, { ...init, signal }),
    },
  });
}

/** 只在服务端管理环境存在时提供存储；每次操作显式限定经过认证的 owner。 */
export function createAiCredentialStore(): AiCredentialStore | undefined {
  if (
    !Deno.env.get('SUPABASE_URL') ||
    !(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY'))
  )
    return undefined;
  return {
    /** 密文读取仅用于状态判断与服务端解密，不传回客户端。 */
    async read(owner, signal) {
      const { data, error } = await credentialClient(signal)
        .from('account_ai_credentials')
        .select('provider,encrypted_key,iv,version')
        .eq('owner_id', owner)
        .maybeSingle();
      if (error) throw new Error('credential_storage_unavailable');
      return data as EncryptedAiCredential | null;
    },
    /** owner 只能来自已验证身份，密文覆盖采用同一账号主键。 */
    async save(owner, value, signal) {
      const { error } = await credentialClient(signal)
        .from('account_ai_credentials')
        .upsert(
          { owner_id: owner, ...value, updated_at: new Date().toISOString() },
          { onConflict: 'owner_id' },
        );
      if (error) throw new Error('credential_storage_unavailable');
    },
    /** 删除可在主密钥缺失时执行；不用读取或解密旧凭据。 */
    async delete(owner, signal) {
      const { error } = await credentialClient(signal)
        .from('account_ai_credentials')
        .delete()
        .eq('owner_id', owner);
      if (error) throw new Error('credential_storage_unavailable');
    },
  };
}
