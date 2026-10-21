/** @fileoverview 在同源标签页间串行提交本机状态，锁覆盖读取、规则校验和完整写入。 */
import type { SetStateAction } from 'react';
import { workspaceStorageKey } from './workspace-runtime';

/**
 * 按存储键独占更新；取得锁后才读取最新值，写入失败则拒绝且不发布成功状态。
 * 当前支持的浏览器和 Electron 安全来源均提供 Web Locks；缺失时明确失败，不退回有竞态的写入。
 */
export async function commitPersistentState<T>(
  key: string,
  initial: T,
  action: SetStateAction<T>,
  normalize?: (value: T) => T,
): Promise<T> {
  if (!navigator.locks?.request)
    throw new Error('当前环境无法安全同步计时，请使用最新版浏览器或桌面应用。');
  const storageKey = workspaceStorageKey(key);
  return navigator.locks.request('threadline:state:' + storageKey, () => {
    const raw = window.localStorage.getItem(storageKey);
    const stored = raw === null ? initial : (JSON.parse(raw) as T);
    const current = normalize ? normalize(stored) : stored;
    const next =
      typeof action === 'function' ? (action as (previous: T) => T)(current) : action;
    if (next !== current) window.localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  });
}
