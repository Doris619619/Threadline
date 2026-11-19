/** @fileoverview 仅在 localhost 显式开发适配器中调用同源临时解析代理，浏览器不接触 DeepSeek Key。 */

import type { Project } from '@/types/domain';
import { getThreadlineDesktopBridge } from '@/lib/desktop-bridge';
import {
  IMPORT_TEXT_LIMIT,
  readParsedImportTasks,
  type ParsedImportTask,
} from './client';

/** 正式 Web、公开 Preview、Electron 及非 loopback 主机永不启用本地开发代理。 */
export function canUseLocalAiPreview(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_THREADLINE_TEST_ADAPTER === 'true' &&
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname) &&
    !getThreadlineDesktopBridge()
  );
}

/** 将文本与当前本地活跃项目交给同源服务；取消会中止请求，响应沿用正式解析的六字段合同。 */
export async function parseLocalImportTasks(
  text: string,
  projects: Project[],
  signal: AbortSignal,
): Promise<ParsedImportTask[]> {
  if (!canUseLocalAiPreview()) throw new Error('本地解析仅供 localhost 开发预览使用。');
  if (signal.aborted) throw new Error('解析已取消或超时，请重试。');
  if (!text.trim() || text.length > IMPORT_TEXT_LIMIT)
    throw new Error('请粘贴 1–20,000 字以内的内容。');
  const controller = new AbortController();
  /** 弹窗关闭与超时均传播给本地代理，不继续等待旧草稿的解析结果。 */
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 95_000);
  try {
    let response: Response;
    try {
      response = await fetch('/api/local-smart-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
          text,
          projects: projects
            .filter((project) => project.status === 'active' && !project.deletedAt)
            .map((project) => ({
              id: project.id,
              name: project.name,
              isFallback: Boolean(project.isFallback),
            })),
        }),
        signal: controller.signal,
      });
    } catch {
      throw new Error(
        controller.signal.aborted
          ? '解析已取消或超时，请重试。'
          : '本地解析服务暂时不可用，请检查服务是否已启动。',
      );
    }
    if (controller.signal.aborted) throw new Error('解析已取消或超时，请重试。');
    const data: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message =
        data &&
        typeof data === 'object' &&
        'error' in data &&
        typeof data.error === 'string'
          ? data.error
          : '本地解析服务暂时不可用，请检查服务是否已启动。';
      throw new Error(message);
    }
    return readParsedImportTasks(data);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
