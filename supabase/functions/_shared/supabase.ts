/** @fileoverview 兼容平台新旧密钥环境并建立独立用户/管理客户端，项目查询始终使用用户 RLS。 */

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import type { AiCredentialStore, EncryptedAiCredential } from './ai-credentials.ts';

/**
 * 优先读取平台复数 JSON 的 default，再尝试单数与 legacy；无效字典不猜测其他具名 key。
 * 用户与管理密钥分开选择，错误配置不能把另一种新 API key 用作当前权限；不记录密钥或解析异常。
 */
function platformApiKey(kind: 'publishable' | 'secret'): string | undefined {
  const prefix = `sb_${kind}_`;
  const dictionaryName =
    kind === 'publishable' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS';
  const raw = Deno.env.get(dictionaryName);
  if (raw) {
    try {
      const dictionary: unknown = JSON.parse(raw);
      if (
        dictionary &&
        typeof dictionary === 'object' &&
        !Array.isArray(dictionary) &&
        Object.hasOwn(dictionary, 'default')
      ) {
        const value = (dictionary as Record<string, unknown>).default;
        if (
          typeof value === 'string' &&
          value.trim().startsWith(prefix) &&
          value.trim().length > prefix.length
        )
          return value.trim();
      }
    } catch {
      // 平台字典缺失或格式无效时仅尝试明确的兼容变量，不披露环境值。
    }
  }
  const names =
    kind === 'publishable'
      ? ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']
      : ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const oppositePrefix = kind === 'publishable' ? 'sb_secret_' : 'sb_publishable_';
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value && !value.startsWith(oppositePrefix)) return value;
  }
}

/** 每次请求建立独立用户作用域客户端，兼容平台新旧公开 key 且不跨请求共享 JWT。 */
export function userClient(authorization: string, signal: AbortSignal) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = platformApiKey('publishable');
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

/** 仅用平台 secret 或 legacy 管理 key 访问私密凭据表，绝不接收用户 JWT 或查询项目。 */
function credentialClient(signal: AbortSignal) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = platformApiKey('secret');
  if (!url || !key) throw new Error('missing_credential_storage');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      /** 管理请求也服从业务 deadline，且不会持久化会话。 */
      fetch: (input, init) => fetch(input, { ...init, signal }),
    },
  });
}

/** 只在兼容的新旧服务端管理环境存在时提供存储，每次操作显式限定已认证 owner。 */
export function createAiCredentialStore(): AiCredentialStore | undefined {
  if (!Deno.env.get('SUPABASE_URL') || !platformApiKey('secret')) return undefined;
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
