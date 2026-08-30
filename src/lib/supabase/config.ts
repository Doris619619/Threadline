/**
 * @fileoverview 解析浏览器可公开的 Supabase 配置，并拒绝把服务端 secret 带入 Renderer。
 */

import { z } from 'zod';

/** 生产只接受 HTTPS；本地开发额外允许 Supabase CLI 的 loopback HTTP。 */
function isSecureOrLoopback(value: string): boolean {
  const parsed = new URL(value);
  return (
    parsed.protocol === 'https:' ||
    (parsed.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))
  );
}

const publicConfigSchema = z.object({
  url: z.string().url().refine(isSecureOrLoopback, {
    message: 'Supabase URL 必须使用 HTTPS；本地开发仅允许 loopback HTTP',
  }),
  publishableKey: z.string().startsWith('sb_publishable_', {
    message: '必须使用 Supabase sb_publishable_ key',
  }),
});

export type SupabasePublicConfig = z.infer<typeof publicConfigSchema>;
export type SupabaseConfigState =
  | { configured: true; value: SupabasePublicConfig }
  | { configured: false; reason: string };

/** 返回当前构建公开配置；缺失时由未配置页面接管，绝不回退 localStorage。 */
export function readSupabasePublicConfig(): SupabaseConfigState {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    return {
      configured: false,
      reason: '缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    };
  }
  if (/service_role|sb_secret_/i.test(publishableKey)) {
    return {
      configured: false,
      reason: '检测到服务端 secret；Renderer 只允许 Supabase publishable key',
    };
  }
  const parsed = publicConfigSchema.safeParse({ url, publishableKey });
  return parsed.success
    ? { configured: true, value: parsed.data }
    : { configured: false, reason: parsed.error.issues[0]?.message ?? '配置无效' };
}
