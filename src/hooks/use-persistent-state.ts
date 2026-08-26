/**
 * @fileoverview 为浏览器本地状态提供可恢复的异步持久化读取。
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

/**
 * 读取本地持久化状态；读取失败时保留初始值并仍然完成水合，避免工作台永久停留在加载态。
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
  normalize?: (value: T) => T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const changedBeforeHydration = useRef(false);
  const repository = useMemo(() => createPersistentStateRepository(), []);

  const setPersistentValue: Dispatch<SetStateAction<T>> = (next) => {
    if (!hydrated) changedBeforeHydration.current = true;
    setValue(next);
  };

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void repository
        .read<T>(key)
        .then((stored) => {
          if (!active) return;
          if (stored !== undefined && !changedBeforeHydration.current)
            setValue(normalize ? normalize(stored) : stored);
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
  }, [key, normalize, repository]);

  useEffect(() => {
    if (hydrated) void repository.write(key, value);
  }, [hydrated, key, repository, value]);

  return [value, setPersistentValue, hydrated];
}
