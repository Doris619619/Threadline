/** @fileoverview 表单写入锁和稳定请求 ID；不确定结果须原样重试，不能用修改后的草稿覆盖同一请求。 */
import { useEffect, useRef, useState } from 'react';
import { useTogether } from './state';
import type { Command } from './types';
import { RejectedSpaceCommand, UnsentSpaceCommand } from './repository';
/** 每个表单保持自己的请求；失败保留内容和错误，重试成功才清错并释放请求 ID。 */
export function useSpaceCommand() {
  const { run } = useTogether();
  const pending = useRef<Command | null>(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  /** 未发送或明确拒绝可修改草稿；结果不明沿用原请求，重试期间保留上次错误直到结果确定。 */
  const submit = async (action: string, payload: Record<string, unknown>) => {
    if (locked.current) return null;
    if (
      pending.current &&
      JSON.stringify({ action, payload }) !==
        JSON.stringify({
          action: pending.current.action,
          payload: pending.current.payload,
        })
    ) {
      setError('上次提交结果尚未确认，请先按原内容重试，或关闭后核对最新记录。');
      return null;
    }
    locked.current = true;
    setBusy(true);
    const wasUncertain = pending.current !== null;
    pending.current ??= { id: crypto.randomUUID(), action, payload };
    try {
      const result = await run(pending.current);
      pending.current = null;
      if (alive.current) setError('');
      return alive.current ? result : null;
    } catch (reason) {
      if (
        reason instanceof RejectedSpaceCommand ||
        (reason instanceof UnsentSpaceCommand && !wasUncertain)
      )
        pending.current = null;
      if (alive.current)
        setError(
          reason instanceof Error ? reason.message : '暂时无法完成操作，请重试。',
        );
      return null;
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return { busy, error, setError, submit };
}
