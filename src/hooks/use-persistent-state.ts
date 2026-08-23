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
      void repository.read<T>(key).then((stored) => {
        if (!active) return;
        if (stored !== undefined && !changedBeforeHydration.current)
          setValue(normalize ? normalize(stored) : stored);
        setHydrated(true);
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
