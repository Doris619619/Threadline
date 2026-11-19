/** @fileoverview 管理当前账号 DeepSeek 凭据的保存状态、加密保存和删除，响应不含任何密钥片段。 */

import {
  encryptAiKey,
  hasAiEncryptionKey,
  type AiCredentialStore,
} from '../_shared/ai-credentials.ts';
import { AI_CORS_HEADERS, aiJson, readLimitedJson } from '../_shared/http.ts';

export type AiSettingsDependencies = {
  authenticate: (authorization: string, signal: AbortSignal) => Promise<string | null>;
  store?: AiCredentialStore;
  encryptionKey?: string;
  serverApiKey?: string;
};

/** 设置端点只有三个操作，用户身份只从认证结果获取；原文密钥仅在保存请求内存里存在。 */
export function createAiSettingsHandler(dependencies: AiSettingsDependencies) {
  /** 确认真实存储成功才返回状态；所有异常脱敏，不做收费 API 测试或声称密钥已连接。 */
  return async function handleAiSettings(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: AI_CORS_HEADERS });
    if (request.method !== 'POST') return aiJson({ error: '仅支持 POST 请求。' }, 405);
    const authorization = request.headers.get('Authorization') ?? '';
    if (!/^Bearer\s+\S+$/i.test(authorization))
      return aiJson({ error: '请先登录后设置 AI 接入。' }, 401);
    if (
      !request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')
    )
      return aiJson({ error: '请求内容必须为 JSON。' }, 415);
    const controller = new AbortController();
    /** 取消或超时只终止当前设置请求；写入结果不明时可以重新读取真实保存状态。 */
    const cancel = () => controller.abort();
    request.signal.addEventListener('abort', cancel, { once: true });
    if (request.signal.aborted) cancel();
    const timeout = setTimeout(cancel, 20_000);
    try {
      const owner = await dependencies.authenticate(authorization, controller.signal);
      if (!owner) return aiJson({ error: '登录已失效，请重新登录。' }, 401);
      const value = await readLimitedJson(request.body, 4096, controller.signal);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return aiJson({ error: 'AI 接入请求格式无效。' }, 400);
      const body = value as Record<string, unknown>;
      if (
        typeof body.action !== 'string' ||
        !['status', 'save', 'delete'].includes(body.action) ||
        ('apiKey' in body && typeof body.apiKey !== 'string') ||
        Object.keys(body).some((key) => !['action', 'apiKey'].includes(key))
      )
        return aiJson({ error: 'AI 接入操作无效。' }, 400);
      const canSave = Boolean(
        dependencies.store && hasAiEncryptionKey(dependencies.encryptionKey),
      );
      const serverConfigured = Boolean(dependencies.serverApiKey?.trim());
      if (body.action === 'save') {
        if (
          typeof body.apiKey !== 'string' ||
          body.apiKey.trim().length < 8 ||
          body.apiKey.trim().length > 512 ||
          /[\s\p{Cc}]/u.test(body.apiKey.trim())
        )
          return aiJson(
            { error: '请输入有效的 DeepSeek API Key（8–512 个字符，不含空白）。' },
            400,
          );
        if (!canSave)
          return aiJson(
            { error: '账号 API 密钥保存服务尚未配置，请联系管理员。' },
            503,
          );
        const encrypted = await encryptAiKey(
          body.apiKey.trim(),
          owner,
          dependencies.encryptionKey!,
        );
        await dependencies.store!.save(owner, encrypted, controller.signal);
        return aiJson({ configured: true, serverConfigured, canSave });
      }
      if (body.action === 'delete') {
        if (!dependencies.store)
          return aiJson(
            { error: '账号 API 密钥保存服务尚未配置，请联系管理员。' },
            503,
          );
        await dependencies.store.delete(owner, controller.signal);
        return aiJson({ configured: false, serverConfigured, canSave });
      }
      const stored = await dependencies.store?.read(owner, controller.signal);
      return aiJson({ configured: Boolean(stored), serverConfigured, canSave });
    } catch (error) {
      if (controller.signal.aborted)
        return aiJson({ error: 'AI 接入请求超时或已取消，请重新读取状态。' }, 504);
      if (
        error instanceof Error &&
        ['invalid_json', 'body_too_large'].includes(error.message)
      )
        return aiJson({ error: 'AI 接入请求格式无效或内容过长。' }, 400);
      return aiJson({ error: 'AI 接入设置暂时不可用，请稍后重试。' }, 503);
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', cancel);
    }
  };
}
