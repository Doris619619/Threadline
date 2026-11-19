/** @fileoverview 验证临时 localhost 解析客户端的开发环境隔离、无密钥请求合同及取消和失败边界。 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canUseLocalAiPreview,
  parseLocalImportTasks,
} from '@/features/tasks/smart-import/local-client';
import type { ThreadlineDesktopBridge } from '@/lib/desktop-bridge';
import type { Project } from '@/types/domain';

const projects: Project[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: '其他',
    color: '#8793a7',
    status: 'active',
    isFallback: true,
    createdAt: '2026-11-19',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: '课程',
    color: '#4f8cff',
    status: 'active',
    createdAt: '2026-11-19',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: '已归档',
    color: '#4f8cff',
    status: 'archived',
    createdAt: '2026-11-19',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: '已删除',
    color: '#4f8cff',
    status: 'active',
    deletedAt: '2026-11-19T01:00:00Z',
    createdAt: '2026-11-19',
  },
];

const task = {
  title: ' 完成作业 ',
  projectId: projects[1].id,
  startTime: null,
  endTime: null,
  plannedMinutes: 40,
  actualMinutes: null,
};

const originalWindow = window;
const request = vi.fn<typeof fetch>();

/** 替换独立 window 表面以测试不同 URL，避免 JSDOM 跨域导航；afterEach 恢复原全局表面。 */
function atUrl(url: string, bridge?: ThreadlineDesktopBridge) {
  const surface = Object.create(originalWindow) as Window;
  Object.defineProperties(surface, {
    location: { configurable: true, value: new URL(url) },
    threadlineDesktop: { configurable: true, value: bridge },
  });
  vi.stubGlobal('window', surface);
}

/** 为受控 HTTP 响应设置 JSON 内容，所有请求均由测试 fetch mock 接管。 */
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NEXT_PUBLIC_THREADLINE_TEST_ADAPTER', 'true');
  atUrl('http://localhost:3000');
  request.mockReset();
  request.mockRejectedValue(new Error('test response not configured'));
  vi.stubGlobal('fetch', request);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('localhost AI preview eligibility', () => {
  it.each(['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'])(
    'allows an explicit development adapter at %s',
    (url) => {
      atUrl(url);
      expect(canUseLocalAiPreview()).toBe(true);
    },
  );

  it.each([
    ['production', 'true', 'http://localhost:3000'],
    ['test', 'true', 'http://localhost:3000'],
    ['development', 'false', 'http://localhost:3000'],
    ['development', '', 'http://localhost:3000'],
    ['development', 'true', 'https://threadline.example.com'],
    ['development', 'true', 'http://192.168.1.3:3000'],
    ['development', 'true', 'http://localhost.attacker.example:3000'],
    ['development', 'true', 'http://127.0.0.1.attacker.example:3000'],
  ])('rejects %s / adapter=%s / %s before any request', async (mode, adapter, url) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('NEXT_PUBLIC_THREADLINE_TEST_ADAPTER', adapter);
    atUrl(url);
    expect(canUseLocalAiPreview()).toBe(false);
    await expect(
      parseLocalImportTasks('完成作业', projects, new AbortController().signal),
    ).rejects.toThrow('本地解析仅供 localhost 开发预览使用。');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects an Electron bridge even when its renderer uses a localhost development URL', async () => {
    atUrl('http://localhost:3000', { environment: 'electron', role: 'timer-station' });
    expect(canUseLocalAiPreview()).toBe(false);
    await expect(
      parseLocalImportTasks('完成作业', projects, new AbortController().signal),
    ).rejects.toThrow('本地解析仅供 localhost 开发预览使用。');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a non-browser context without requesting a local endpoint', async () => {
    vi.stubGlobal('window', undefined);
    expect(canUseLocalAiPreview()).toBe(false);
    await expect(
      parseLocalImportTasks('完成作业', projects, new AbortController().signal),
    ).rejects.toThrow('本地解析仅供 localhost 开发预览使用。');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('localhost AI parse request and response', () => {
  it('posts only original text and usable project identities to the same-origin endpoint and validates the shared six fields', async () => {
    request.mockResolvedValueOnce(jsonResponse({ tasks: [task] }));
    const text = '嗯，我得完成作业。'.repeat(100) + '\n预计 40 分钟。';
    const result = await parseLocalImportTasks(
      text,
      projects,
      new AbortController().signal,
    );
    expect(result).toEqual([{ ...task, title: '完成作业' }]);
    expect(Object.keys(result[0]).sort()).toEqual([
      'actualMinutes',
      'endTime',
      'plannedMinutes',
      'projectId',
      'startTime',
      'title',
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('/api/local-smart-import');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const headers = new Headers(options?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.has('Authorization')).toBe(false);
    expect(JSON.parse(String(options?.body))).toEqual({
      text,
      projects: [
        { id: projects[0].id, name: '其他', isFallback: true },
        { id: projects[1].id, name: '课程', isFallback: false },
      ],
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each(['', ' '.repeat(10), '字'.repeat(20_001)])(
    'rejects empty or oversized source input without fetching',
    async (text) => {
      await expect(
        parseLocalImportTasks(text, projects, new AbortController().signal),
      ).rejects.toThrow('请粘贴 1–20,000 字以内的内容。');
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each([
    { tasks: [{ ...task, title: '' }] },
    { tasks: [{ ...task, plannedMinutes: -1 }] },
    { tasks: [{ ...task, startTime: '25:00' }] },
    { tasks: [{ ...task, priority: 'high' }] },
    { tasks: [{ title: '字段缺失', projectId: projects[0].id }] },
    { tasks: 'not-an-array' },
  ])(
    'rejects an invalid local response instead of accepting a partial task',
    async (body) => {
      request.mockResolvedValueOnce(jsonResponse(body));
      await expect(
        parseLocalImportTasks('完成作业', projects, new AbortController().signal),
      ).rejects.toThrow('解析结果不完整，请重新解析。');
    },
  );

  it('rejects a successful HTTP response whose body is not valid JSON', async () => {
    request.mockResolvedValueOnce(new Response('not JSON', { status: 200 }));
    await expect(
      parseLocalImportTasks('完成作业', projects, new AbortController().signal),
    ).rejects.toThrow('解析结果不完整，请重新解析。');
  });

  it('reports an unavailable local service and does not treat its response as task data', async () => {
    request.mockResolvedValueOnce(jsonResponse({ error: '本地解析尚未配置。' }, 503));
    await expect(
      parseLocalImportTasks('完成作业', projects, new AbortController().signal),
    ).rejects.toThrow('本地解析尚未配置。');
  });

  it('provides an actionable failure for a network rejection or malformed service error', async () => {
    request.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(
      parseLocalImportTasks('完成作业', projects, new AbortController().signal),
    ).rejects.toThrow('本地解析服务暂时不可用，请检查服务是否已启动。');
    request.mockResolvedValueOnce(new Response('not JSON', { status: 503 }));
    await expect(
      parseLocalImportTasks('完成作业', projects, new AbortController().signal),
    ).rejects.toThrow('本地解析服务暂时不可用，请检查服务是否已启动。');
  });
});

describe('localhost parser cancellation', () => {
  it('does not issue a request for a caller that has already cancelled', async () => {
    const caller = new AbortController();
    caller.abort();
    await expect(
      parseLocalImportTasks('完成作业', projects, caller.signal),
    ).rejects.toThrow('解析已取消或超时，请重试。');
    expect(request).not.toHaveBeenCalled();
  });

  it('propagates a later cancellation and normalizes the fetch rejection', async () => {
    let fetchSignal: AbortSignal | null | undefined;
    /** 模拟遵守 signal 的浏览器 fetch；测试不调用任何真实地址。 */
    request.mockImplementationOnce(async (_url, options) => {
      fetchSignal = options?.signal;
      return new Promise((_resolve, reject) => {
        fetchSignal?.addEventListener('abort', () => reject(new Error('test abort')), {
          once: true,
        });
      });
    });
    const caller = new AbortController();
    const pending = parseLocalImportTasks('完成作业', projects, caller.signal);
    const assertion = expect(pending).rejects.toThrow('解析已取消或超时，请重试。');
    caller.abort();
    await assertion;
    expect(fetchSignal?.aborted).toBe(true);
  });
});
