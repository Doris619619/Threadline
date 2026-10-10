/** @fileoverview 为短表单和管理命令提供同步防重入、等待反馈与可重试错误。 */
'use client';
import { useRef, useState } from 'react';

/** 同一表单一次只执行一个命令；重试保留旧错误直到确认成功，避免错误区短暂消失。 */
export function useGuardedAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  /** 同步拦截重复调用，原错误持续显示至这次请求确认成功。 */
  const run = async (action: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试。');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
