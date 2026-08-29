/**
 * @fileoverview 创建 Web 与 Electron Renderer 共用的 Supabase browser client 单例。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabasePublicConfig } from '@/lib/supabase/config';

let browserClient: SupabaseClient | undefined;

/** 使用持久会话和自动刷新创建客户端；Main/Preload 不导入本模块。 */
export function getSupabaseBrowserClient(config: SupabasePublicConfig): SupabaseClient {
  browserClient ??= createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return browserClient;
}
