/** @fileoverview 启动仅监听回环地址的临时 AI 解析代理，密钥由 stdin 输入且只保留在当前进程内存。 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createImportHandler } from '../supabase/functions/smart-task-import/handler.ts';
import type { ImportProject } from '../supabase/functions/smart-task-import/parser.ts';

const MAX_BODY_BYTES = 160_000;
const LOCAL_BROWSER_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
]);

/** 本机响应不开放 CORS；只发送明确的公开数据，不序列化底层异常或请求头。 */
function send(response: ServerResponse, value: unknown, status = 200) {
  if (response.writableEnded || response.destroyed) return;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

/** 检查当前监听端口的回环 Host，阻止从外站域名通过 DNS rebinding 使用本机密钥。 */
function localHost(host: string | undefined, port: number): boolean {
  return Boolean(
    host && [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host),
  );
}

/** 读取大小受限的 JSON；所有内容只在当前请求内存中处理。 */
async function readBody(request: IncomingMessage): Promise<unknown> {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.byteLength;
    if (length > MAX_BODY_BYTES) throw new Error('body_too_large');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** 本地演示项目必须显式提供，限制数量/名称/身份并要求恰有一个真实 fallback；不接受自定义调用地址。 */
function parseInput(
  value: unknown,
): { text: string; projects: ImportProject[] } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some((key) => key !== 'text' && key !== 'projects') ||
    typeof body.text !== 'string' ||
    !body.text.trim() ||
    body.text.length > 20_000 ||
    !Array.isArray(body.projects) ||
    !body.projects.length ||
    body.projects.length > 100
  )
    return;
  const projects: ImportProject[] = [];
  for (const value of body.projects) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).length !== 3 ||
      Object.keys(row).some((key) => !['id', 'name', 'isFallback'].includes(key)) ||
      typeof row.id !== 'string' ||
      !row.id.trim() ||
      row.id.length > 128 ||
      typeof row.name !== 'string' ||
      !row.name.trim() ||
      row.name.length > 200 ||
      typeof row.isFallback !== 'boolean' ||
      /\p{Cc}/u.test(row.id + row.name)
    )
      return;
    projects.push({ id: row.id, name: row.name, isFallback: row.isFallback });
  }
  if (
    new Set(projects.map((project) => project.id)).size !== projects.length ||
    projects.filter((project) => project.isFallback).length !== 1
  )
    return;
  return { text: body.text, projects };
}

/** 创建未监听的本机服务供入口与测试共用；dispose 会立即清空密钥引用、取消活动请求并关闭所有连接。 */
export function createLocalPreviewServer(options: {
  apiKey: string;
  fetch?: typeof fetch;
}) {
  let apiKey = options.apiKey;
  const modelFetch = options.fetch;
  options = { apiKey: '', fetch: modelFetch };
  const requests = new Set<AbortController>();
  const server = createServer((request, response) => {
    /** 单个请求只解析，不创建任何任务；原 Edge handler 的认证依赖替换为当前回环演示身份。 */
    const run = async () => {
      const address = server.address();
      if (
        !address ||
        typeof address === 'string' ||
        !localHost(request.headers.host, address.port)
      )
        return send(response, { error: '本机解析请求来源无效。' }, 403);
      const origin = request.headers.origin;
      if (
        (origin && !LOCAL_BROWSER_ORIGINS.has(origin)) ||
        request.headers['sec-fetch-site'] === 'cross-site'
      )
        return send(response, { error: '本机解析请求来源无效。' }, 403);
      if (request.method === 'GET' && request.url === '/status')
        return send(response, { ready: Boolean(apiKey) });
      if (request.method !== 'POST' || request.url !== '/parse')
        return send(response, { error: '本机解析路径或方法无效。' }, 404);
      if (
        !request.headers['content-type']?.toLowerCase().startsWith('application/json')
      )
        return send(response, { error: '本机解析仅接受 JSON。' }, 415);
      const input = parseInput(await readBody(request));
      if (!input) return send(response, { error: '本机解析内容或项目无效。' }, 400);
      if (!apiKey) return send(response, { error: '本机解析服务已关闭。' }, 503);
      const controller = new AbortController();
      requests.add(controller);
      /** 客户端断开时停止模型等待，不重试可能收费的请求。 */
      const cancel = () => {
        if (!response.writableEnded) controller.abort();
      };
      request.once('aborted', cancel);
      response.once('close', cancel);
      try {
        const handler = createImportHandler({
          /** 只返回内存密钥引用，不从请求、环境变量或磁盘读取。 */
          resolveApiKey: async () => apiKey || undefined,
          /** 本机身份只在经过 Host/Origin 检查后构造，不能被请求内容指定。 */
          authenticate: async () => 'local-preview',
          /** 提供已经验证的当前演示项目，模型仍沿用原六字段和 fallback 验证。 */
          listProjects: async () => input.projects,
          fetch: modelFetch,
        });
        const result = await handler(
          new Request('http://127.0.0.1/local-preview', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer local-preview',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: input.text }),
            signal: controller.signal,
          }),
        );
        if (!result.ok) {
          await result.body?.cancel();
          return send(
            response,
            { error: '本机解析服务暂时不可用，请稍后重试。' },
            result.status,
          );
        }
        const value: unknown = await result.json();
        return send(response, value);
      } finally {
        requests.delete(controller);
        request.removeListener('aborted', cancel);
        response.removeListener('close', cancel);
      }
    };
    void run().catch((error) =>
      send(
        response,
        { error: '本机解析内容无效或服务暂不可用。' },
        error instanceof Error && error.message === 'body_too_large' ? 413 : 400,
      ),
    );
  });
  server.requestTimeout = 75_000;
  server.headersTimeout = 10_000;
  /** 主动关闭时先清空内存引用并取消模型调用，避免等待连接自然结束才释放密钥。 */
  const dispose = async () => {
    apiKey = '';
    for (const controller of requests) controller.abort();
    requests.clear();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  };
  server.once('close', () => {
    apiKey = '';
  });
  return { server, dispose };
}

/** 只从 stdin 首行取得密钥；限制输入大小，读取后立即释放缓冲并暂停 stdin，不持久化或打印内容。 */
async function readStartupKey(): Promise<string> {
  return new Promise((resolveKey, reject) => {
    let buffer = '';
    /** 清理 stdin 的所有本次监听与明文缓冲，不影响进程其他事件。 */
    const clean = () => {
      buffer = '';
      process.stdin.removeListener('data', receive);
      process.stdin.removeListener('end', ended);
      process.stdin.pause();
    };
    /** 仅接收一行受限 JSON，拒绝控制字符和不合理密钥长度。 */
    const receive = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 4096) {
        clean();
        reject(new Error('invalid_startup'));
        return;
      }
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      try {
        const body: unknown = JSON.parse(buffer.slice(0, end));
        if (
          !body ||
          typeof body !== 'object' ||
          !('apiKey' in body) ||
          typeof body.apiKey !== 'string' ||
          body.apiKey.length < 8 ||
          body.apiKey.length > 512 ||
          /[\s\p{Cc}]/u.test(body.apiKey)
        )
          throw new Error();
        const key = body.apiKey;
        body.apiKey = '';
        clean();
        resolveKey(key);
      } catch {
        clean();
        reject(new Error('invalid_startup'));
      }
    };
    /** stdin 未提供完整首行时固定失败，不能把输入片段写入日志。 */
    const ended = () => {
      clean();
      reject(new Error('invalid_startup'));
    };
    process.stdin.on('data', receive);
    process.stdin.once('end', ended);
    process.stdin.resume();
  });
}

/** 直接运行构建后的 ESM 入口时启动固定回环端口；导入测试不会运行或读取 stdin。 */
async function main() {
  let apiKey = await readStartupKey();
  const instance = createLocalPreviewServer({ apiKey });
  apiKey = '';
  /** 系统停止时清除引用和请求；日志仅报告固定服务状态。 */
  const stop = () => {
    void instance.dispose();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('exit', () => {
    void instance.dispose();
  });
  await new Promise<void>((done, reject) => {
    instance.server.once('error', reject);
    instance.server.listen(8871, '127.0.0.1', () => done());
  });
  process.stdout.write('Local AI preview ready on 127.0.0.1:8871\n');
}

if (
  process.argv[1] &&
  import.meta.url.startsWith('file:') &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  void main().catch(() => {
    process.stderr.write('Local AI preview failed to start.\n');
    process.exitCode = 1;
  });
}
