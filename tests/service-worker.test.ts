/** @fileoverview 验证 Service Worker 的跨域边界，以及大字体响应交付后的可靠缓存写入。 */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

/** 在最小 worker context 中加载真实 sw.js，并返回注册的 fetch handler。 */
function loadFetchHandler() {
  const handlers = new Map<string, (event: unknown) => void>();
  const context = {
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
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
  it('falls back after five seconds when asset headers arrive but its body stalls', async () => {
    vi.useFakeTimers();
    try {
      const { handler, fetch, caches } = loadFetchHandler();
      caches.match.mockResolvedValue(new Response('cached font'));
      fetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'font/woff2' }),
        clone: () => ({ arrayBuffer: () => new Promise(() => undefined) }),
      });
      let response!: Promise<Response>;
      handler({
        request: {
          method: 'GET',
          url: 'https://threadline.example/font.woff2',
          mode: 'cors',
          destination: 'font',
        },
        respondWith: (value: Promise<Response>) => {
          response = value;
        },
        waitUntil: vi.fn(),
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(await (await response).text()).toBe('cached font');
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
      expect(caches.open).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('N08 limits network waiting to five seconds only when a cached asset exists', async () => {
    vi.useFakeTimers();
    try {
      const { handler, fetch, caches } = loadFetchHandler();
      caches.match.mockResolvedValue(new Response('cached image'));
      fetch.mockImplementation(
        (_request, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      );
      let response!: Promise<Response>;
      handler({
        request: {
          method: 'GET',
          url: 'https://threadline.example/icon.svg',
          mode: 'cors',
          destination: 'image',
        },
        respondWith: (value: Promise<Response>) => {
          response = value;
        },
        waitUntil: vi.fn(),
      });
      await vi.advanceTimersByTimeAsync(4999);
      let resolved = false;
      void response.then(() => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await (await response).text()).toBe('cached image');
    } finally {
      vi.useRealTimers();
    }
  });

  it('N08 waits beyond five seconds for an uncached asset and rejects HTML', async () => {
    vi.useFakeTimers();
    try {
      const { handler, fetch } = loadFetchHandler();
      let release!: (response: Response) => void;
      fetch.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      let response!: Promise<Response>;
      handler({
        request: {
          method: 'GET',
          url: 'https://threadline.example/font.woff2',
          mode: 'cors',
          destination: 'font',
        },
        respondWith: (value: Promise<Response>) => {
          response = value;
        },
        waitUntil: vi.fn(),
      });
      await vi.advanceTimersByTimeAsync(6000);
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
      const failed = expect(response).rejects.toThrow('Invalid asset');
      release(
        new Response('<html>fallback</html>', {
          headers: { 'content-type': 'text/html' },
        }),
      );
      await failed;
    } finally {
      vi.useRealTimers();
    }
  });
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
