/** @fileoverview 调用仅负责解析的 Edge Function，校验响应并保留取消与超时边界。 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const IMPORT_TEXT_LIMIT = 20_000;
const optionalMinutes = z.number().int().min(0).max(2147483647).nullable();
const parsedTask = z
  .object({
    title: z.string().trim().min(1).max(200),
    projectId: z.string().min(1),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    plannedMinutes: optionalMinutes,
    actualMinutes: optionalMinutes,
  })
  .strict();
const responseSchema = z.object({ tasks: z.array(parsedTask).max(100) }).strict();
export type ParsedImportTask = z.infer<typeof parsedTask>;

/** 云解析与 localhost 开发代理共享同一六字段响应校验，拒绝畸形或扩展参数。 */
export function readParsedImportTasks(data: unknown): ParsedImportTask[] {
  const result = responseSchema.safeParse(data);
  if (!result.success) throw new Error('解析结果不完整，请重新解析。');
  return result.data.tasks;
}

/** 只发送用户文本；项目由服务端按当前身份读取，取消或超时不会触发任何任务写入。 */
export async function parseImportTasks(
  client: SupabaseClient | undefined,
  text: string,
  signal: AbortSignal,
): Promise<ParsedImportTask[]> {
  if (!client) throw new Error('智能解析需要登录云工作区，演示模式暂不支持。');
  if (!text.trim() || text.length > IMPORT_TEXT_LIMIT)
    throw new Error(
      `请粘贴 1–${IMPORT_TEXT_LIMIT.toLocaleString('zh-CN')} 字以内的内容。`,
    );
  const controller = new AbortController();
  /** 转发弹窗关闭取消；使用基础 AbortController 兼容 iPhone PWA。 */
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timeout = setTimeout(cancel, 95_000);
  try {
    // SDK 也可能直接 reject；不能将底层取消异常或内部网络细节显示给用户。
    const { data, error } = await client.functions
      .invoke('smart-task-import', {
        body: { text },
        signal: controller.signal,
      })
      .catch(() => {
        throw new Error(
          controller.signal.aborted
            ? '解析已取消或超时，请重试。'
            : '暂时无法解析，请检查网络及智能导入服务配置后重试。',
        );
      });
    if (controller.signal.aborted) throw new Error('解析已取消或超时，请重试。');
    if (error) {
      if (error.context instanceof Response) {
        const body: unknown = await error.context.json().catch(() => undefined);
        if (
          body &&
          typeof body === 'object' &&
          'error' in body &&
          typeof body.error === 'string'
        )
          throw new Error(body.error);
      }
      throw new Error('暂时无法解析，请检查网络及智能导入服务配置后重试。');
    }
    return readParsedImportTasks(data);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
