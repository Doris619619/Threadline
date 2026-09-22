/**
 * @fileoverview 创建 Web 与 Electron Renderer 共用的 Supabase browser client 单例。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabasePublicConfig } from '@/lib/supabase/config';
import { trackedCloudFetch } from '@/lib/cloud-write-guard';

let browserClient: SupabaseClient | undefined;

/** 为读取及认证提供真实网络 deadline；保留调用者取消，不自动重试可能已提交的业务写入。 */
export async function fetchWithRecoveryDeadline(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase();
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (method !== 'GET' && method !== 'HEAD' && !url.pathname.startsWith('/auth/v1/'))
    return trackedCloudFetch(input, init);
  const callerSignal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);
  // Safari 16.4 不支持 AbortSignal.any，使用基础 controller 保持 iPhone PWA 兼容。
  const controller = new AbortController();
  const cancel = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) cancel();
  else callerSignal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException('云端请求超时，请检查网络后重试。', 'TimeoutError'),
      ),
    20_000,
  );
  try {
    const response = await trackedCloudFetch(input, {
      ...init,
      signal: controller.signal,
    });
    // deadline 覆盖响应体接收，不能在只收到 headers 时就解除超时保护。
    if (method === 'GET' || method === 'HEAD') await response.clone().arrayBuffer();
    return response;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', cancel);
  }
}

/** 使用持久会话和自动刷新创建客户端；Main/Preload 不导入本模块。 */
export function getSupabaseBrowserClient(config: SupabasePublicConfig): SupabaseClient {
  browserClient ??= createClient(config.url, config.publishableKey, {
    global: { fetch: fetchWithRecoveryDeadline },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return browserClient;
}
