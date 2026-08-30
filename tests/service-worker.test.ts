/** @fileoverview 验证 Service Worker 不接管 Supabase 等 cross-origin Auth/REST/Realtime 请求。 */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

/** 在最小 worker context 中加载真实 sw.js，并返回注册的 fetch handler。 */
function loadFetchHandler() {
  const handlers = new Map<string, (event: unknown) => void>();
  const context = {
    URL,
    fetch: vi.fn(),
    caches: {},
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
  return { handler, fetch: context.fetch };
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
});
