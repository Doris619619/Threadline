/** @fileoverview 验证 Service Worker 的跨域边界，以及大字体响应交付后的可靠缓存写入。 */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

/** 在最小 worker context 中加载真实 sw.js，并返回注册的 fetch handler。 */
function loadFetchHandler() {
  const handlers = new Map<string, (event: unknown) => void>();
  const context = {
    URL,
    fetch: vi.fn(),
    caches: { match: vi.fn().mockResolvedValue(undefined), open: vi.fn() },
    self: {
      location: { origin: 'https://threadline.example' },
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        handlers.set(name, handler),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    },
  };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), context);
  const handler = handlers.get('fetch');
  if (!handler) throw new Error('Service Worker did not register fetch handler.');
  return { handler, fetch: context.fetch, caches: context.caches };
}

describe('service worker origin boundary', () => {
  it('does not call respondWith or fetch for a Supabase cross-origin request', () => {
    const { handler, fetch } = loadFetchHandler();
    const respondWith = vi.fn();
    handler({
      request: {
        method: 'GET',
        url: 'https://project.supabase.co/rest/v1/tasks',
        mode: 'cors',
        destination: '',
      },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('clones a font before the browser consumes it and extends the worker lifetime for the cache write', async () => {
    const { handler, fetch, caches } = loadFetchHandler();
    let openCache!: (cache: { put: typeof put }) => void;
    const put = vi.fn(async (_request: unknown, response: Response) => response.text());
    caches.open.mockImplementation(
      () =>
        new Promise((resolve) => {
          openCache = resolve;
        }),
    );
    fetch.mockResolvedValue(new Response('font bytes'));
    let delivered!: Promise<Response>;
    const pending: Promise<unknown>[] = [];
    handler({
      request: {
        method: 'GET',
        url: 'https://threadline.example/fonts/SourceHanSansSC.woff2',
        mode: 'cors',
        destination: 'font',
      },
      respondWith: (response: Promise<Response>) => {
        delivered = response;
      },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    expect(await (await delivered).text()).toBe('font bytes');
    expect(pending).toHaveLength(1);
    openCache({ put });
    await Promise.all(pending);
    expect(put).toHaveBeenCalledOnce();
    expect(await put.mock.results[0].value).toBe('font bytes');
  });
});
