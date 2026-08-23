'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
  normalize?: (value: T) => T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const changedBeforeHydration = useRef(false);

  const setPersistentValue: Dispatch<SetStateAction<T>> = (next) => {
    if (!hydrated) changedBeforeHydration.current = true;
    setValue(next);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = window.localStorage.getItem(key);
      if (raw && !changedBeforeHydration.current) {
        try {
          const parsed = JSON.parse(raw) as T;
          setValue(normalize ? normalize(parsed) : parsed);
        } catch {
          window.localStorage.removeItem(key);
        }
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, normalize]);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(key, JSON.stringify(value));
  }, [hydrated, key, value]);

  return [value, setPersistentValue, hydrated];
}
