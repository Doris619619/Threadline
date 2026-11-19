/** @fileoverview 为两个 AI Edge 端点提供跨平台 CORS、无缓存 JSON 与可取消的有限大小读取。 */

export const AI_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** 所有响应附带同一 CORS 与 no-store，调用者只提供可以公开的响应值。 */
export function aiJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...AI_CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** 在读取过程中限制体积并响应取消，不依赖可能缺失或伪造的 Content-Length。 */
export async function readLimitedJson(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
  signal: AbortSignal,
): Promise<unknown> {
  if (!body) throw new Error('invalid_json');
  const reader = body.getReader();
  /** 即使输入流没有主动响应取消，deadline 也会解除 reader 的等待。 */
  const cancelRead = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancelRead, { once: true });
  if (signal.aborted) cancelRead();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        throw new Error('body_too_large');
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancelRead);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('invalid_json');
  }
}
