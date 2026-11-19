/** @fileoverview 验证临时本机 AI 代理的开发门禁、来源/体积/项目边界与真实解析器复用，不调用供应商 API。 */

import type { AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalPreviewServer } from '../scripts/local-ai-preview';
import { GET, POST } from '@/app/api/local-smart-import/route.web';

const localKey = 'sk-local-test-only-key-123456789';
const projects = [
  { id: 'course', name: '课程', isFallback: false },
  { id: 'fallback', name: '其他', isFallback: true },
];
const task = {
  title: '完成 ECE4016 作业',
  projectId: 'course',
  startTime: null,
  endTime: null,
  plannedMinutes: null,
  actualMinutes: null,
};

/** 用真实 Node HTTP 服务验证回环请求边界；上游模型请求由显式依赖替代。 */
async function start(
  fetcher: typeof fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify({ tasks: [task] }) },
            },
          ],
        }),
      ),
  ),
) {
  const instance = createLocalPreviewServer({ apiKey: localKey, fetch: fetcher });
  await new Promise<void>((done) =>
    instance.server.listen(0, '127.0.0.1', () => done()),
  );
  const origin = `http://127.0.0.1:${(instance.server.address() as AddressInfo).port}`;
  return { ...instance, origin, fetcher };
}

/** 生产形态的本地演示解析请求不携带 Key，项目来自当前页面。 */
function parseRequest(
  origin: string,
  body: unknown = { text: '嗯那个，完成 ECE4016 作业，就是这个作业。', projects },
  headers: Record<string, string> = {},
) {
  return fetch(`${origin}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** 原生 HTTP 可构造真实 DNS-rebinding Host；fetch 会规范化 Host，不能用它伪造此边界。 */
function forgedHostRequest(origin: string): Promise<number | undefined> {
  return new Promise((done, reject) => {
    const request = httpRequest(
      `${origin}/status`,
      { headers: { Host: 'attacker.example:8871' } },
      (response) => {
        response.resume();
        done(response.statusCode);
      },
    );
    request.once('error', reject);
    request.end();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('本机内存解析服务', () => {
  it('状态只返回ready，解析复用真实Edge handler且密钥只发往固定供应商请求', async () => {
    const instance = await start();
    try {
      const status = await fetch(`${instance.origin}/status`);
      expect(await status.json()).toEqual({ ready: true });
      expect(status.headers.get('Access-Control-Allow-Origin')).toBeNull();
      const response = await parseRequest(instance.origin);
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toEqual({ tasks: [task] });
      expect(JSON.stringify(result)).not.toContain(localKey);
      const [url, init] = vi.mocked(instance.fetcher).mock.calls[0];
      expect(url).toBe('https://api.deepseek.com/chat/completions');
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${localKey}` });
      const modelBody = JSON.parse(String(init?.body));
      expect(modelBody.response_format).toEqual({ type: 'json_object' });
      expect(modelBody.messages[0].content).toContain('course');
    } finally {
      await instance.dispose();
    }
  });

  it('拒绝外站Origin、其他端口Origin和DNS rebinding Host且不调用模型', async () => {
    const instance = await start();
    try {
      expect(
        (
          await parseRequest(
            instance.origin,
            { text: '完成作业', projects },
            { Origin: 'https://attacker.example' },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await parseRequest(
            instance.origin,
            { text: '完成作业', projects },
            { Origin: 'http://localhost:4000' },
          )
        ).status,
      ).toBe(403);
      expect(await forgedHostRequest(instance.origin)).toBe(403);
      expect(instance.fetcher).not.toHaveBeenCalled();
    } finally {
      await instance.dispose();
    }
  });

  it('允许localhost:3000同源演示来源，不开放CORS', async () => {
    const instance = await start();
    try {
      const response = await parseRequest(
        instance.origin,
        { text: '完成作业', projects },
        { Origin: 'http://localhost:3000' },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    } finally {
      await instance.dispose();
    }
  });

  it.each([
    { text: '', projects },
    { text: '字'.repeat(20_001), projects },
    { text: '任务', projects: [] },
    { text: '任务', projects: [projects[0]] },
    { text: '任务', projects: [projects[1], projects[1]] },
    { text: '任务', projects: [{ ...projects[0], isFallback: 'yes' }, projects[1]] },
    { text: '任务', projects, target: 'https://attacker.example' },
    {
      text: '任务',
      projects: [{ ...projects[0], name: 'x'.repeat(201) }, projects[1]],
    },
  ])('拒绝无效文本/项目或任意目标地址 %#', async (body) => {
    const instance = await start();
    try {
      expect((await parseRequest(instance.origin, body)).status).toBe(400);
      expect(instance.fetcher).not.toHaveBeenCalled();
    } finally {
      await instance.dispose();
    }
  });

  it('非JSON请求与非解析路径不会触发付费调用', async () => {
    const instance = await start();
    try {
      expect(
        (await parseRequest(instance.origin, {}, { 'Content-Type': 'text/plain' }))
          .status,
      ).toBe(415);
      expect((await fetch(`${instance.origin}/arbitrary`)).status).toBe(404);
      expect(
        (await fetch(`${instance.origin}/parse`, { method: 'OPTIONS' })).status,
      ).toBe(404);
      expect(instance.fetcher).not.toHaveBeenCalled();
    } finally {
      await instance.dispose();
    }
  });

  it('上游失败只返回固定安全错误，不泄露密钥或诊断', async () => {
    const upstream = vi.fn(
      async () => new Response(`private ${localKey}`, { status: 500 }),
    );
    const instance = await start(upstream);
    try {
      const response = await parseRequest(instance.origin);
      expect(response.status).toBe(502);
      const result = await response.text();
      expect(result).not.toContain(localKey);
      expect(result).not.toContain('private');
    } finally {
      await instance.dispose();
    }
  });
});

/** 设置完整开发开关；请求URL也必须保持本机，生产构建不能仅凭公开适配器标记启用。 */
function enableDevelopment() {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NEXT_PUBLIC_THREADLINE_TEST_ADAPTER', 'true');
  vi.stubEnv('ELECTRON_BUILD', 'false');
}

/** 以浏览器同源POST语义构造Next请求，测试不依赖运行中的Next服务器。 */
function webRequest(
  headers: Record<string, string> = {},
  body = JSON.stringify({ text: '完成作业', projects }),
) {
  return new Request('http://localhost:3000/api/local-smart-import', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  });
}

describe('Next 本机开发转发门禁', () => {
  it('production、Electron、关闭测试适配器与非回环地址一律不启用', async () => {
    const proxy = vi.spyOn(globalThis, 'fetch');
    enableDevelopment();
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      (await GET(new Request('http://localhost:3000/api/local-smart-import'))).status,
    ).toBe(404);
    enableDevelopment();
    vi.stubEnv('ELECTRON_BUILD', 'true');
    expect(
      (await GET(new Request('http://localhost:3000/api/local-smart-import'))).status,
    ).toBe(404);
    enableDevelopment();
    vi.stubEnv('NEXT_PUBLIC_THREADLINE_TEST_ADAPTER', 'false');
    expect(
      (await GET(new Request('http://localhost:3000/api/local-smart-import'))).status,
    ).toBe(404);
    enableDevelopment();
    expect(
      (await GET(new Request('https://example.com/api/local-smart-import'))).status,
    ).toBe(404);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('拒绝非同源Origin、缺少Origin、非JSON和伪造Host', async () => {
    enableDevelopment();
    const proxy = vi.spyOn(globalThis, 'fetch');
    expect(
      (await POST(webRequest({ Origin: 'https://attacker.example' }))).status,
    ).toBe(403);
    expect((await POST(webRequest({ Origin: '' }))).status).toBe(403);
    expect((await POST(webRequest({ 'Content-Type': 'text/plain' }))).status).toBe(415);
    expect((await POST(webRequest({ Host: 'attacker.example:3000' }))).status).toBe(
      403,
    );
    expect(proxy).not.toHaveBeenCalled();
  });

  it('状态只从固定回环地址读取，服务不在线时ready=false', async () => {
    enableDevelopment();
    const proxy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"ready":true,"private":"not forwarded"}'))
      .mockRejectedValueOnce(new Error('internal connection diagnostic'));
    const request = new Request('http://localhost:3000/api/local-smart-import');
    expect(await (await GET(request)).json()).toEqual({ ready: true });
    expect(proxy.mock.calls[0][0]).toBe('http://127.0.0.1:8871/status');
    expect(await (await GET(request)).json()).toEqual({ ready: false });
  });

  it('允许Next内部localhost与实际回环Host别名不同，但Origin仍必须匹配实际Host', async () => {
    enableDevelopment();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"tasks":[]}'));
    const aliased = webRequest({
      Host: '127.0.0.1:3000',
      Origin: 'http://127.0.0.1:3000',
    });
    expect((await POST(aliased)).status).toBe(200);
    expect(
      (
        await POST(
          webRequest({ Host: '127.0.0.1:3000', Origin: 'http://localhost:3000' }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          webRequest({ Host: 'user@127.0.0.1:3000', Origin: 'http://127.0.0.1:3000' }),
        )
      ).status,
    ).toBe(403);
  });

  it('只固定代理文本项目，不转发浏览器认证头，成功响应不包含额外字段', async () => {
    enableDevelopment();
    const proxy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tasks: [task], private: 'ignored' })),
      );
    const response = await POST(
      webRequest({ Authorization: 'Bearer must-not-forward' }),
    );
    expect(await response.json()).toEqual({ tasks: [task] });
    const [url, init] = proxy.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8871/parse');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('拒绝超大/畸形JSON并对代理错误使用固定安全文本', async () => {
    enableDevelopment();
    const proxy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(`private ${localKey}`, { status: 502 }));
    expect((await POST(webRequest({}, 'x'.repeat(160_001)))).status).toBe(413);
    expect((await POST(webRequest({}, '{'))).status).toBe(400);
    expect(proxy).not.toHaveBeenCalled();
    const response = await POST(webRequest());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(localKey);
  });
});
