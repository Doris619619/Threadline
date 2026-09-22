/** @fileoverview 提供会话隔离的批注读写、确认任务自动迁移和用户主动导入入口。 */
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
  annotationAccountKey,
  readAnnotationDocument,
  readLegacyAnnotations,
  changeAnnotationDocument,
  importAnnotationDocument,
} from '@/lib/annotation-account-storage';
import type { AnnotationStroke } from '@/types/domain';
export type AnnotationImport = {
  count: number;
  error?: string;
  importLegacy: () => Promise<void>;
  retry: () => Promise<void>;
};
const emptyIds: string[] = [];
/** 旧会话的异步锁等待和补查结果不得写入新会话；跨标签页仅应用本次实际差异。 */
export function useAnnotationStrokes(
  owner = 'local',
  confirmedIds: string[] = emptyIds,
): [
  AnnotationStroke[],
  Dispatch<SetStateAction<AnnotationStroke[]>>,
  boolean,
  AnnotationImport,
] {
  const scope = useMemo(
    () => ({
      key: annotationAccountKey(owner),
      active: false,
      pending: new Map<symbol, (strokes: AnnotationStroke[]) => AnnotationStroke[]>(),
    }),
    [owner],
  );
  const [state, setState] = useState<{
    scope: typeof scope;
    strokes: AnnotationStroke[];
    hydrated: boolean;
    count: number;
    error?: string;
  }>();
  const current = useRef<AnnotationStroke[]>([]);
  const allowed = useMemo(() => new Set(confirmedIds), [confirmedIds]);
  /** 读取完成后才发布当前账号内容；存储错误保留已有可恢复草稿。 */
  const refresh = useCallback(() => {
    if (!scope.active) return;
    try {
      const document = readAnnotationDocument(scope.key);
      const visible = [...scope.pending.values()].reduce(
        (strokes, apply) => apply(strokes),
        document.strokes,
      );
      current.current = visible;
      setState((previous) => ({
        scope,
        strokes: visible,
        error: scope.pending.size ? previous?.error : undefined,
        hydrated: true,
        count: readLegacyAnnotations().filter(
          (item) => !document.imported.includes(item.source),
        ).length,
      }));
    } catch (error) {
      setState((previous) => ({
        scope,
        strokes: previous?.scope === scope ? previous.strokes : [],
        hydrated: true,
        count: previous?.count ?? 0,
        error: String(error),
      }));
    }
  }, [scope]);
  useEffect(() => {
    scope.active = true;
    current.current = [];
    refresh();
    const sync = () => refresh();
    window.addEventListener('storage', sync);
    window.addEventListener('threadline-annotations', sync);
    return () => {
      scope.active = false;
      window.removeEventListener('storage', sync);
      window.removeEventListener('threadline-annotations', sync);
    };
  }, [scope, refresh]);
  /** 任何持久化错误可见；原文与旧存储始终保留。 */
  const fail = useCallback(
    (error: unknown) => {
      if (scope.active)
        setState((previous) => ({
          scope,
          strokes: current.current,
          hydrated: true,
          count: previous?.count ?? 0,
          error: `批注保存失败，请重试：${String(error)}`,
        }));
    },
    [scope],
  );
  const importLegacy = useCallback(
    async (explicit = true) => {
      try {
        await changeAnnotationDocument(
          scope.key,
          () => scope.active,
          (document) => importAnnotationDocument(document, allowed, explicit),
        );
        refresh();
      } catch (error) {
        fail(error);
      }
    },
    [allowed, fail, refresh, scope],
  );
  useEffect(() => {
    if (allowed.size) void importLegacy(false);
  }, [allowed, importLegacy]);
  /** 失败差异留在本会话内，外部刷新不会抹掉草稿；用户可在存储恢复后重试。 */
  const retry = useCallback(async () => {
    let saved: symbol[] = [];
    try {
      await changeAnnotationDocument(
        scope.key,
        () => scope.active,
        (document) => {
          const pending = [...scope.pending];
          saved = pending.map(([key]) => key);
          return {
            ...document,
            strokes: pending.reduce(
              (strokes, [, apply]) => apply(strokes),
              document.strokes,
            ),
          };
        },
      );
      for (const key of saved) scope.pending.delete(key);
      refresh();
    } catch (error) {
      fail(error);
    }
  }, [fail, refresh, scope]);
  const update = useCallback<Dispatch<SetStateAction<AnnotationStroke[]>>>(
    (action) => {
      if (!scope.active) return;
      const previous = current.current;
      const next = typeof action === 'function' ? action(previous) : action;
      const removed = new Set(
        previous
          .filter((stroke) => !next.some((item) => item.id === stroke.id))
          .map((stroke) => stroke.id),
      );
      const changed = next.filter(
        (stroke) =>
          JSON.stringify(stroke) !==
          JSON.stringify(previous.find((item) => item.id === stroke.id)),
      );
      if (!removed.size && !changed.length) return;
      current.current = next;
      setState((value) => ({
        scope,
        strokes: next,
        hydrated: true,
        count: value?.count ?? 0,
      }));
      scope.pending.set(Symbol(), (strokes) => [
        ...strokes.filter(
          (stroke) =>
            !removed.has(stroke.id) && !changed.some((item) => item.id === stroke.id),
        ),
        ...changed,
      ]);
      void retry();
    },
    [retry, scope],
  );
  return [
    state?.scope === scope ? state.strokes : [],
    update,
    state?.scope === scope && state.hydrated,
    {
      count: state?.scope === scope ? state.count : 0,
      error: state?.scope === scope ? state.error : undefined,
      importLegacy,
      retry,
    },
  ];
}
