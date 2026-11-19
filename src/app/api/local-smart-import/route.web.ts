/** @fileoverview 仅在本机开发测试适配器下转发智能解析，固定连接内存代理且不接收或返回 API 密钥。 */

export const dynamic = 'force-dynamic';

const PROXY_ORIGIN = 'http://127.0.0.1:8871';
const MAX_BODY_BYTES = 160_000;

/** 返回无 CORS、无缓存的本机响应；异常消息不得包含代理返回的诊断或请求内容。 */
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** 开发开关、构建模式和实际请求地址同时限定本机入口，生产和 Electron 永不启用。 */
function gate(request: Request, requireOrigin: boolean): Response | undefined {
  const url = new URL(request.url);
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.NEXT_PUBLIC_THREADLINE_TEST_ADAPTER !== 'true' ||
    process.env.ELECTRON_BUILD === 'true' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    return json({ ready: false }, 404);
  const host = request.headers.get('Host');
  let browserOrigin = url.origin;
  if (host) {
    try {
      const hostUrl = new URL(`${url.protocol}//${host}`);
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(hostUrl.hostname) ||
        hostUrl.host !== host ||
        hostUrl.port !== url.port ||
        hostUrl.username ||
        hostUrl.password
      )
        return json({ error: '本机解析请求来源无效。' }, 403);
      // Next 开发服务器可能把内部 URL 标准化为 localhost；浏览器来源以已验证的实际 Host 为准。
      browserOrigin = hostUrl.origin;
    } catch {
      return json({ error: '本机解析请求来源无效。' }, 403);
    }
  }
  const origin = request.headers.get('Origin');
  if (
    (requireOrigin && !origin) ||
    (origin && origin !== browserOrigin) ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site'
  )
    return json({ error: '本机解析请求来源无效。' }, 403);
}

/** 有界接收 JSON 请求文本，避免将超大输入转发给仅限本机的代理。 */
async function readBody(request: Request): Promise<string> {
  if (!request.body) throw new Error('invalid_body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error('body_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body = new TextDecoder().decode(bytes);
  JSON.parse(body);
  return body;
}

/** 状态只说明本机内存代理是否就绪；代理关闭时返回 false，不披露连接错误。 */
export async function GET(request: Request): Promise<Response> {
  const denied = gate(request, false);
  if (denied) return denied;
  try {
    const response = await fetch(`${PROXY_ORIGIN}/status`, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(2000),
    });
    const value: unknown = await response.json();
    return json({
      ready:
        response.ok &&
        Boolean(
          value &&
          typeof value === 'object' &&
          'ready' in value &&
          value.ready === true,
        ),
    });
  } catch {
    return json({ ready: false });
  }
}

/** 只转发同源开发页面提供的文本及演示项目，目标地址固定且不携带用户认证或密钥。 */
export async function POST(request: Request): Promise<Response> {
  const denied = gate(request, true);
  if (denied) return denied;
  if (
    !request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')
  )
    return json({ error: '本机解析仅接受 JSON。' }, 415);
  let body: string;
  try {
    body = await readBody(request);
  } catch (error) {
    return json(
      { error: '本机解析内容格式无效或过长。' },
      error instanceof Error && error.message === 'body_too_large' ? 413 : 400,
    );
  }
  const controller = new AbortController();
  /** 关闭解析弹窗时同时停止本机代理等待，超时不重试收费请求。 */
  const cancel = () => controller.abort();
  request.signal.addEventListener('abort', cancel, { once: true });
  if (request.signal.aborted) cancel();
  const timeout = setTimeout(cancel, 75_000);
  try {
    const response = await fetch(`${PROXY_ORIGIN}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      return json(
        { error: '本机解析服务暂时不可用，请检查内容后重试。' },
        response.status >= 400 && response.status < 600 ? response.status : 503,
      );
    }
    const value: unknown = await response.json();
    if (
      !value ||
      typeof value !== 'object' ||
      !('tasks' in value) ||
      !Array.isArray(value.tasks)
    )
      return json({ error: '本机解析结果无效，请重试。' }, 502);
    return json({ tasks: value.tasks });
  } catch {
    return json({ error: '本机解析服务未就绪或请求已取消，请重试。' }, 503);
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener('abort', cancel);
  }
}
