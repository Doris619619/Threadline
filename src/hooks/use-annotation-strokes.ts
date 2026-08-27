/**
 * @fileoverview 为 Annotation v2 提供专用本地读取、v1 单向迁移和写入，不扩展通用状态迁移框架。
 */

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  ANNOTATION_STORAGE_KEY_V1,
  ANNOTATION_STORAGE_KEY_V2,
  migrateLegacyAnnotationStrokes,
  normalizeAnnotationStrokes,
} from '@/lib/annotation-storage';
import { createPersistentStateRepository } from '@/lib/repository';
import type { AnnotationStroke } from '@/types/domain';

/** 读取 v2 或在其不存在时迁移 v1，并只在 hydration 后把后续编辑写入 v2。 */
export function useAnnotationStrokes(): [
  AnnotationStroke[],
  Dispatch<SetStateAction<AnnotationStroke[]>>,
  boolean,
] {
  const repository = useMemo(() => createPersistentStateRepository(), []);
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const strokesRef = useRef(strokes);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    let active = true;
    void repository
      .read<unknown>(ANNOTATION_STORAGE_KEY_V2)
      .then(async (v2) => {
        if (v2 !== undefined) return normalizeAnnotationStrokes(v2);
        const migrated = migrateLegacyAnnotationStrokes(
          await repository.read<unknown>(ANNOTATION_STORAGE_KEY_V1),
        );
        await repository.write(ANNOTATION_STORAGE_KEY_V2, migrated);
        return migrated;
      })
      .then((next) => {
        if (!active) return;
        strokesRef.current = next;
        setStrokes(next);
        setHydrated(true);
      })
      .catch(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [repository]);

  /** 解析 React updater 后立刻保存 v2，保证 Pointer 事件批量更新不会丢失前一笔。 */
  const setPersistentStrokes = useCallback<
    Dispatch<SetStateAction<AnnotationStroke[]>>
  >(
    (next) => {
      const resolved =
        typeof next === 'function'
          ? (next as (previous: AnnotationStroke[]) => AnnotationStroke[])(
              strokesRef.current,
            )
          : next;
      strokesRef.current = resolved;
      setStrokes(resolved);
      if (hydrated) void repository.write(ANNOTATION_STORAGE_KEY_V2, resolved);
    },
    [hydrated, repository],
  );

  return [strokes, setPersistentStrokes, hydrated];
}
