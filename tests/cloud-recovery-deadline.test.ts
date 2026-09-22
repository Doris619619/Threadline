/** @fileoverview 验证恢复请求有取消 deadline，并保留业务写入和调用者取消边界。 */
import { afterEach, expect, it, vi } from 'vitest';
import { fetchWithRecoveryDeadline } from '@/lib/supabase/client';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['headers', 'body'])(
  'K04 aborts hung initialization %s and releases the write guard',
  async (stage) => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_input, init) => {
        const wait = () =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () => reject(init.signal.reason)),
          );
        return stage === 'headers'
          ? wait()
          : Promise.resolve({ clone: () => ({ arrayBuffer: wait }) });
      }),
    );
    const request = fetchWithRecoveryDeadline(
      'https://example.invalid/rest/v1/rpc/initialize_workspace',
      { method: 'POST' },
    );
    const failure = expect(request).rejects.toThrow('云端请求超时');
    await vi.advanceTimersByTimeAsync(20_000);
    await failure;
    const { getPendingCloudWrites } = await import('@/lib/cloud-write-guard');
    expect(getPendingCloudWrites()).toBe(0);
  },
);

it('aborts a stalled read at the recovery deadline', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason));
        }),
    ),
  );
  const request = fetchWithRecoveryDeadline('https://example.invalid/rest/v1/tasks');
  const failed = expect(request).rejects.toThrow('云端请求超时');
  await vi.advanceTimersByTimeAsync(20_000);
  await failed;
});

it('preserves caller cancellation on an authentication request', async () => {
  const caller = new AbortController();
  caller.abort();
  const fetch = vi.fn().mockRejectedValue(new Error('aborted'));
  vi.stubGlobal('fetch', fetch);
  await expect(
    fetchWithRecoveryDeadline('https://example.invalid/auth/v1/token', {
      method: 'POST',
      signal: caller.signal,
    }),
  ).rejects.toThrow('aborted');
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});

it('does not add recovery cancellation to a business RPC write', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  const init = { method: 'POST', body: '{}' };
  await fetchWithRecoveryDeadline(
    'https://example.invalid/rest/v1/rpc/save_task',
    init,
  );
  expect(fetch.mock.calls[0][1]).toBe(init);
});
