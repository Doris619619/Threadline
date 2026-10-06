/**
 * @fileoverview 提供浏览器状态持久化与可选的同账号跨标签同步，接收变更不回写旧值。
 */

'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { createPersistentStateRepository } from '@/lib/repository';
import { workspaceStorageKey } from '@/lib/workspace-runtime';

/** 读取最新本机值，避免旧标签页的后续操作恢复已删除的记录；存储不可用时保留内存值。 */
function readCurrentValue<T>(
  key: string,
  fallback: T,
  empty: T,
  normalize?: (value: T) => T,
): T {
  try {
    const raw = window.localStorage.getItem(workspaceStorageKey(key));
    const stored = raw === null ? empty : (JSON.parse(raw) as T);
    return normalize ? normalize(stored) : stored;
  } catch {
    return fallback;
  }
}

/**
 * 读取失败仍完成水合；跨标签同步只由明确启用的调用方使用，外部变更不产生写回。
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
  normalize?: (value: T) => T,
  options: { synchronizeTabs?: boolean } = {},
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const changedBeforeHydration = useRef(false);
  const valueRef = useRef(value);
  const initialRef = useRef(value);
  const normalizeRef = useRef(normalize);
  const repository = useMemo(() => createPersistentStateRepository(), []);
  const synchronizeTabs = options.synchronizeTabs ?? false;

  // 调用方常为轻量数据清洗传入 inline normalizer；更新引用不能让 hydration effect 重跑。
  useEffect(() => {
    normalizeRef.current = normalize;
  }, [normalize]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  /** 在已 hydration 后同步提交本次状态变更，避免紧接 reload 时丢失用户操作。 */
  const setPersistentValue: Dispatch<SetStateAction<T>> = (next) => {
    if (!hydrated) changedBeforeHydration.current = true;
    const resolved =
      typeof next === 'function'
        ? (next as (previous: T) => T)(
            hydrated && synchronizeTabs
              ? readCurrentValue(
                  key,
                  valueRef.current,
                  initialRef.current,
                  normalizeRef.current,
                )
              : valueRef.current,
          )
        : next;
    valueRef.current = resolved;
    if (hydrated) void repository.write(key, resolved);
    setValue(resolved);
  };

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void repository
        .read<T>(key)
        .then((stored) => {
          if (!active) return;
          if (stored !== undefined && !changedBeforeHydration.current) {
            const restored = normalizeRef.current
              ? normalizeRef.current(stored)
              : stored;
            valueRef.current = restored;
            setValue(restored);
          }
          // 只在初始化时持久化；收到另一标签的值不能回写，否则旧事件会覆盖新的删除。
          if (
            !synchronizeTabs ||
            stored === undefined ||
            changedBeforeHydration.current
          )
            void repository.write(key, valueRef.current);
          setHydrated(true);
        })
        .catch(() => {
          if (active) setHydrated(true);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [key, repository, synchronizeTabs]);

  /** 初始化时即订阅所属账号的跨标签变更，避免水合提交与下一次 effect 之间漏掉删除。 */
  useEffect(() => {
    if (!synchronizeTabs) return;
    const refresh = () => {
      const current = readCurrentValue(
        key,
        valueRef.current,
        initialRef.current,
        normalizeRef.current,
      );
      valueRef.current = current;
      setValue(current);
    };
    const onStorage = (event: StorageEvent) => {
      if (
        (event.key === null || event.key === workspaceStorageKey(key)) &&
        (!event.storageArea || event.storageArea === window.localStorage)
      )
        refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, synchronizeTabs]);

  return [value, setPersistentValue, hydrated];
}
