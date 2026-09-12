/** @fileoverview 为短表单和管理命令提供同步防重入、等待反馈与可重试错误。 */
'use client';
import { useRef, useState } from 'react';

/** 同一表单一次只执行一个命令；失败不清空草稿，错误由当前表单展示。 */
export function useGuardedAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (action: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试。');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
