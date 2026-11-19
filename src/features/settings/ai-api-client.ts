/** @fileoverview 通过已登录的 Edge Function 管理个人 DeepSeek 密钥，仅返回布尔配置状态，不缓存或回显密钥。 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const statusSchema = z
  .object({
    configured: z.boolean(),
    serverConfigured: z.boolean(),
    canSave: z.boolean(),
  })
  .strict();

export type AiApiStatus = z.infer<typeof statusSchema>;
export type AiApiAction = 'status' | 'save' | 'delete';

/**
 * 发送一次账号级配置请求；关闭页面或 20 秒超时会取消请求，错误只显示固定文案，避免密钥进入错误提示。
 * 密钥仅在 save 请求体中传输，响应严格限制为配置状态；本函数不写本地存储或查询缓存。
 */
export async function requestAiApiSettings(
  client: SupabaseClient,
  action: AiApiAction,
  signal: AbortSignal,
  apiKey?: string,
): Promise<AiApiStatus> {
  if (signal.aborted) throw new Error('请求已取消或超时，请重试。');
  if (action === 'save' && !apiKey?.trim())
    throw new Error('请输入 DeepSeek API Key。');
  const controller = new AbortController();
  /** 转发页面卸载取消，兼容移动 PWA 的基础 AbortController。 */
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timeout = setTimeout(cancel, 20_000);
  let cancelPending!: () => void;
  // 即使底层 SDK 尚未响应 abort，也在取消时结束页面等待。
  const cancelled = new Promise<never>((_resolve, reject) => {
    /** 取消仅终止等待并返回固定文案，原始 SDK 错误和密钥均不进入提示。 */
    cancelPending = () => reject(new Error('请求已取消或超时，请重试。'));
    controller.signal.addEventListener('abort', cancelPending, { once: true });
  });
  const failure =
    action === 'status'
      ? '暂时无法读取 API 接入状态，请重试。'
      : action === 'save'
        ? '保存失败，请稍后重试。'
        : '移除失败，请稍后重试。';
  try {
    const { data, error } = await Promise.race([
      client.functions.invoke('ai-api-settings', {
        body: action === 'save' ? { action, apiKey: apiKey!.trim() } : { action },
        signal: controller.signal,
      }),
      cancelled,
    ]).catch(() => {
      throw new Error(
        controller.signal.aborted ? '请求已取消或超时，请重试。' : failure,
      );
    });
    if (controller.signal.aborted) throw new Error('请求已取消或超时，请重试。');
    if (error) throw new Error(failure);
    const result = statusSchema.safeParse(data);
    if (!result.success) throw new Error('API 接入状态不完整，请重新读取。');
    return result.data;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', cancelPending);
  }
}
