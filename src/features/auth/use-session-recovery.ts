/** @fileoverview 恢复持久会话，区分未登录与恢复失败，并隔离迟到响应和认证事件。 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';

/** 网络失败不主动清除凭证；在线恢复和用户重试都重新读取同一 Supabase 会话。 */
export function useSessionRecovery(client: SupabaseClient, queryClient: QueryClient) {
  const [session, setSession] = useState<Session | null>();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const retryRef = useRef<() => void>(() => undefined);
  const retry = useCallback(() => retryRef.current(), []);

  useEffect(() => {
    let mounted = true;
    let revision = 0;
    let failed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** 一个读取尝试只影响当前 revision；认证事件和卸载均使旧响应失效。 */
    const recover = () => {
      const request = ++revision;
      clearTimeout(timer);
      failed = false;
      setError(undefined);
      setDone(false);
      timer = setTimeout(() => {
        if (!mounted || request !== revision) return;
        failed = true;
        setError('恢复登录状态超时，请检查网络后重试。');
      }, 20_000);
      void client.auth
        .getSession()
        .then(({ data, error: cause }) => {
          if (!mounted || request !== revision) return;
          clearTimeout(timer);
          if (cause) {
            failed = true;
            setError(`恢复登录状态失败：${cause.message}`);
            return;
          }
          failed = false;
          setError(undefined);
          setSession(data.session);
          setDone(true);
        })
        .catch((cause: unknown) => {
          if (!mounted || request !== revision) return;
          clearTimeout(timer);
          failed = true;
          setError(
            cause instanceof Error ? cause.message : '恢复登录状态失败，请重试。',
          );
        });
    };
    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      // INITIAL_SESSION 没有错误信息；由 getSession 的结果区分离线与真正未登录。
      if (!mounted || event === 'INITIAL_SESSION') return;
      revision++;
      clearTimeout(timer);
      failed = false;
      setError(undefined);
      setSession(nextSession);
      setDone(true);
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    /** 只在失败后随网络恢复重试，不因普通 focus 反复遮挡正在使用的工作台。 */
    const recoverIfFailed = () => {
      if (failed) recover();
    };
    retryRef.current = recover;
    recover();
    window.addEventListener('online', recoverIfFailed);
    window.addEventListener('focus', recoverIfFailed);
    return () => {
      mounted = false;
      revision++;
      clearTimeout(timer);
      retryRef.current = () => undefined;
      data.subscription.unsubscribe();
      window.removeEventListener('online', recoverIfFailed);
      window.removeEventListener('focus', recoverIfFailed);
    };
  }, [client, queryClient]);
  return { session, done, error, retry };
}
