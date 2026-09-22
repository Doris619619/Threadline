/** @fileoverview 覆盖离线恢复、认证事件竞争、超时重试与卸载隔离，确保不误清持久凭证。 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { useSessionRecovery } from '@/features/auth/use-session-recovery';

const session = { user: { id: 'test-owner' } } as Session;
/** 创建可延迟读取及发送认证事件的 client；不触碰任何真实账号或令牌。 */
function fixture() {
  let listener: (event: AuthChangeEvent, value: Session | null) => void = () => {};
  const getSession = vi.fn();
  const unsubscribe = vi.fn();
  const client = {
    auth: {
      getSession,
      onAuthStateChange: (callback: typeof listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  } as unknown as SupabaseClient;
  const cache = new QueryClient();
  const clear = vi.spyOn(cache, 'clear');
  return {
    client,
    cache,
    clear,
    getSession,
    unsubscribe,
    emit: (event: AuthChangeEvent, value: Session | null) => listener(event, value),
  };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('restores a persisted session without clearing query data', async () => {
  const f = fixture();
  f.getSession.mockResolvedValue({ data: { session }, error: null });
  const { result } = renderHook(() => useSessionRecovery(f.client, f.cache));
  await waitFor(() => expect(result.current.done).toBe(true));
  expect(result.current.session).toBe(session);
  expect(f.clear).not.toHaveBeenCalled();
});

it('distinguishes a failed recovery from a genuinely anonymous session', async () => {
  const f = fixture();
  f.getSession.mockResolvedValue({
    data: { session: null },
    error: { message: 'network unavailable' },
  });
  const { result } = renderHook(() => useSessionRecovery(f.client, f.cache));
  act(() => f.emit('INITIAL_SESSION', null));
  await waitFor(() => expect(result.current.error).toContain('network unavailable'));
  expect(result.current.done).toBe(false);
  expect(result.current.session).toBeUndefined();
  expect(f.clear).not.toHaveBeenCalled();
  f.getSession.mockResolvedValue({ data: { session }, error: null });
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(result.current.session).toBe(session));
  expect(result.current.error).toBeUndefined();
});

it('accepts a successful anonymous read as the login gate', async () => {
  const f = fixture();
  f.getSession.mockResolvedValue({ data: { session: null }, error: null });
  const { result } = renderHook(() => useSessionRecovery(f.client, f.cache));
  await waitFor(() => expect(result.current.done).toBe(true));
  expect(result.current.session).toBeNull();
  expect(result.current.error).toBeUndefined();
});

it('does not let a late getSession overwrite a newer sign-in', async () => {
  const f = fixture();
  let finish!: (value: unknown) => void;
  f.getSession.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = renderHook(() => useSessionRecovery(f.client, f.cache));
  act(() => f.emit('SIGNED_IN', session));
  await act(async () => finish({ data: { session: null }, error: null }));
  expect(result.current.session).toBe(session);
});

it('does not resurrect a session after a newer sign-out', async () => {
  const f = fixture();
  let finish!: (value: unknown) => void;
  f.getSession.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = renderHook(() => useSessionRecovery(f.client, f.cache));
  act(() => f.emit('SIGNED_OUT', null));
  await act(async () => finish({ data: { session }, error: null }));
  expect(result.current.session).toBeNull();
  expect(f.clear).toHaveBeenCalledOnce();
});

it('exposes a timeout and lets retry supersede a stalled read', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.getSession.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useSessionRecovery(f.client, f.cache));
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(result.current.error).toContain('超时');
  f.getSession.mockResolvedValue({ data: { session }, error: null });
  await act(async () => result.current.retry());
  expect(result.current.session).toBe(session);
  expect(result.current.error).toBeUndefined();
});

it('handles rejected promises and removes recovery listeners on unmount', async () => {
  const f = fixture();
  f.getSession.mockRejectedValue(new Error('offline'));
  const { result, unmount } = renderHook(() => useSessionRecovery(f.client, f.cache));
  await waitFor(() => expect(result.current.error).toBe('offline'));
  unmount();
  window.dispatchEvent(new Event('online'));
  expect(f.getSession).toHaveBeenCalledOnce();
  expect(f.unsubscribe).toHaveBeenCalledOnce();
});
