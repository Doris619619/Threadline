/** @fileoverview 将 Supabase Edge Runtime 认证及只读项目查询接到 DeepSeek 解析器，密钥只读取服务端环境。 */

import {
  authenticateAiUser,
  createAiCredentialStore,
  userClient,
} from '../_shared/supabase.ts';
import { resolveAiApiKey } from '../_shared/ai-credentials.ts';
import { createImportHandler } from './handler.ts';

Deno.serve(
  createImportHandler({
    /** 优先使用当前账号加密凭据，无账号凭据时保留全局服务配置。 */
    resolveApiKey(owner, signal) {
      return resolveAiApiKey(owner, signal, {
        store: createAiCredentialStore(),
        encryptionKey: Deno.env.get('AI_CREDENTIALS_ENCRYPTION_KEY'),
        serverApiKey: Deno.env.get('DEEPSEEK_API_KEY'),
      });
    },
    model: Deno.env.get('DEEPSEEK_MODEL'),
    authenticate: authenticateAiUser,
    /** 只读取当前用户的活跃项目，显式 owner 过滤同时保留 RLS 约束。 */
    async listProjects(authorization, owner, signal) {
      const { data, error } = await userClient(authorization, signal)
        .from('projects')
        .select('id,name,is_fallback')
        .eq('owner_id', owner)
        .eq('status', 'active')
        .is('deleted_at', null)
        .order('position');
      if (error) throw new Error('projects_unavailable');
      return (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        isFallback: Boolean(row.is_fallback),
      }));
    },
  }),
);
