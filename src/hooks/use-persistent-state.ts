/**
 * @fileoverview 提供浏览器状态持久化、跨标签订阅和可等待的独占提交，接收变更不回写旧值。
 */

'use client';

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { createPersistentStateRepository } from '@/lib/repository';
import { workspaceStorageKey } from '@/lib/workspace-runtime';
import { commitPersistentState } from '@/lib/persistent-state-transaction';

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
 * 读取失败仍完成水合；第四项用于跨标签原子提交，调用方必须等待确认后再执行后续副作用。
 * 普通偏好仍使用同步 setter；跨标签接收与空值初始化均不回写，避免覆盖另一标签的提交。
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
  normalize?: (value: T) => T,
  options: { synchronizeTabs?: boolean } = {},
): [
  T,
  Dispatch<SetStateAction<T>>,
  boolean,
  (next: SetStateAction<T>) => Promise<void>,
] {
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

  /** 在跨标签锁内提交后才发布本页值；再次读取可吸收锁释放后已经完成的其他提交。 */
  const commitValue = useCallback(
    async (next: SetStateAction<T>) => {
      if (!hydrated) throw new Error('计时尚未恢复，请稍后重试。');
      const committed = await commitPersistentState(
        key,
        initialRef.current,
        next,
        normalizeRef.current,
      );
      const latest = readCurrentValue(
        key,
        committed,
        initialRef.current,
        normalizeRef.current,
      );
      valueRef.current = latest;
      setValue(latest);
    },
    [hydrated, key],
  );

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
          if (!synchronizeTabs) void repository.write(key, valueRef.current);
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

  return [value, setPersistentValue, hydrated, commitValue];
}
