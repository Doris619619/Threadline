/** @fileoverview 处理已登录用户的 AI 解析 HTTP 请求，限制输入、超时和模型返回；解析阶段不保存业务数据。 */

import {
  buildImportPrompt,
  MAX_IMPORT_TEXT_LENGTH,
  validateImportResult,
  type ImportProject,
} from './parser.ts';

import { AI_CORS_HEADERS, aiJson as json, readLimitedJson } from '../_shared/http.ts';
import { AiCredentialsUnavailableError } from '../_shared/ai-credentials.ts';

const MAX_BODY_BYTES = 160_000;
const MAX_RESPONSE_BYTES = 300_000;
export const IMPORT_TIMEOUT_MS = 65_000;

export type ImportHandlerDependencies = {
  apiKey?: string;
  resolveApiKey?: (owner: string, signal: AbortSignal) => Promise<string | undefined>;
  model?: string;
  authenticate: (authorization: string, signal: AbortSignal) => Promise<string | null>;
  listProjects: (
    authorization: string,
    owner: string,
    signal: AbortSignal,
  ) => Promise<ImportProject[]>;
  fetch?: typeof fetch;
};

/** 创建可注入认证/只读项目查询/上游请求的处理器，测试无需访问真实账户或消耗模型额度。 */
export function createImportHandler(dependencies: ImportHandlerDependencies) {
  /** 认证优先于收费调用；同一 deadline 覆盖认证、项目读取与完整模型响应。 */
  return async function handleImport(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: AI_CORS_HEADERS });
    if (request.method !== 'POST') return json({ error: '仅支持 POST 请求。' }, 405);
    const authorization = request.headers.get('Authorization') ?? '';
    if (!/^Bearer\s+\S+$/i.test(authorization))
      return json({ error: '请先登录后再解析任务。' }, 401);
    if (
      !request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')
    )
      return json({ error: '请求内容必须为 JSON。' }, 415);
    const controller = new AbortController();
    /** 来自客户端的取消同时停止上游请求，避免关闭弹窗后仍等待返回。 */
    const cancel = () => controller.abort();
    request.signal.addEventListener('abort', cancel, { once: true });
    if (request.signal.aborted) cancel();
    const timeout = setTimeout(cancel, IMPORT_TIMEOUT_MS);
    let readingModelResponse = false;
    try {
      const owner = await dependencies.authenticate(authorization, controller.signal);
      if (!owner) return json({ error: '登录已失效，请重新登录后解析。' }, 401);
      const value = await readLimitedJson(
        request.body,
        MAX_BODY_BYTES,
        controller.signal,
      );
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        typeof (value as Record<string, unknown>).text !== 'string'
      )
        return json({ error: '请提供需要解析的文字。' }, 400);
      const text = (value as { text: string }).text.trim();
      if (!text) return json({ error: '请先粘贴需要解析的内容。' }, 400);
      if (text.length > MAX_IMPORT_TEXT_LENGTH)
        return json(
          {
            error: `内容最多 ${MAX_IMPORT_TEXT_LENGTH.toLocaleString('en-US')} 字，请分段解析。`,
          },
          413,
        );
      const apiKey = dependencies.resolveApiKey
        ? await dependencies.resolveApiKey(owner, controller.signal)
        : dependencies.apiKey?.trim();
      if (!apiKey)
        return json(
          {
            error:
              '请到设置 → AI / API 接入填写 DeepSeek API Key，或联系管理员配置解析服务。',
          },
          503,
        );
      const projects = await dependencies.listProjects(
        authorization,
        owner,
        controller.signal,
      );
      if (!projects.some((project) => project.isFallback))
        return json({ error: '未找到可用的“其他”项目，请刷新工作台后重试。' }, 409);
      const response = await (dependencies.fetch ?? fetch)(
        'https://api.deepseek.com/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: dependencies.model?.trim() || 'deepseek-flash',
            thinking: { type: 'disabled' },
            response_format: { type: 'json_object' },
            max_tokens: 16_384,
            stream: false,
            messages: [
              { role: 'system', content: buildImportPrompt(projects) },
              { role: 'user', content: text },
            ],
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        return json(
          {
            error:
              response.status === 429
                ? '解析服务繁忙，请稍后重试。'
                : '解析服务暂时不可用，请稍后重试。',
          },
          response.status === 429 ? 429 : 502,
        );
      }
      readingModelResponse = true;
      const payload = (await readLimitedJson(
        response.body,
        MAX_RESPONSE_BYTES,
        controller.signal,
      )) as {
        choices?: { finish_reason?: string; message?: { content?: unknown } }[];
      };
      const choice = payload?.choices?.[0];
      if (
        choice?.finish_reason !== 'stop' ||
        typeof choice.message?.content !== 'string'
      )
        throw new Error('invalid_model_output');
      let parsed: unknown;
      try {
        parsed = JSON.parse(choice.message.content);
      } catch {
        throw new Error('invalid_model_output');
      }
      return json({ tasks: validateImportResult(parsed, projects) });
    } catch (error) {
      if (controller.signal.aborted)
        return json({ error: '解析超时或已取消，请重试。' }, 504);
      if (error instanceof AiCredentialsUnavailableError)
        return json(
          {
            error:
              '账号 API 密钥无法读取，请重新在 AI 接入保存或联系管理员检查服务配置。',
          },
          503,
        );
      if (
        !readingModelResponse &&
        error instanceof Error &&
        error.message === 'body_too_large'
      )
        return json({ error: '内容过长，请分段解析。' }, 413);
      if (
        !readingModelResponse &&
        error instanceof Error &&
        error.message === 'invalid_json'
      )
        return json({ error: '请求内容格式无效，请重试。' }, 400);
      if (error instanceof Error && error.message === 'too_many_tasks')
        return json({ error: '单次最多解析 100 条任务，请分段解析。' }, 422);
      return json({ error: '无法读取有效的任务解析结果，请重试。' }, 502);
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', cancel);
    }
  };
}
