/** @fileoverview 验证账号隔离、非破坏导入及持久化失败不会丢失源笔迹。 */
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useAnnotationStrokes } from '@/hooks/use-annotation-strokes';
import {
  annotationAccountKey,
  readAnnotationDocument,
} from '@/lib/annotation-account-storage';
import {
  ANNOTATION_STORAGE_KEY_V1,
  ANNOTATION_STORAGE_KEY_V2,
} from '@/lib/annotation-storage';
const ids = ['a-task'];
const stroke = {
  id: 'stroke',
  color: '#f00',
  strokeWidth: 2,
  createdAt: '2026-09-21T00:00:00Z',
  points: [{ x: 0.1, y: 0.1 }],
  targetScope: 'global' as const,
};
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it('imports a preserved v1/v2 stroke once and keeps its already migrated date', async () => {
  const old = JSON.stringify([{ ...stroke, targetScope: 'today' }]);
  const newer = JSON.stringify([
    { ...stroke, targetScope: 'date', targetDate: '2026-08-01' },
  ]);
  localStorage.setItem(ANNOTATION_STORAGE_KEY_V1, old);
  localStorage.setItem(ANNOTATION_STORAGE_KEY_V2, newer);
  const hook = renderHook(() => useAnnotationStrokes('A'));
  await waitFor(() => expect(hook.result.current[3].count).toBe(1));
  await act(() => hook.result.current[3].importLegacy());
  await act(() => hook.result.current[3].importLegacy());
  expect(hook.result.current[0]).toHaveLength(1);
  expect(hook.result.current[0][0].targetDate).toBe('2026-08-01');
  expect(localStorage.getItem(ANNOTATION_STORAGE_KEY_V1)).toBe(old);
  expect(localStorage.getItem(ANNOTATION_STORAGE_KEY_V2)).toBe(newer);
});

it('merges independent mounted consumers without overwriting another tab stroke', async () => {
  const first = renderHook(() => useAnnotationStrokes('A'));
  const second = renderHook(() => useAnnotationStrokes('A'));
  await act(async () => {
    first.result.current[1]((rows) => [...rows, stroke]);
    second.result.current[1]((rows) => [...rows, { ...stroke, id: 'second' }]);
  });
  expect(
    readAnnotationDocument(annotationAccountKey('A'))
      .strokes.map((row) => row.id)
      .sort(),
  ).toEqual(['second', 'stroke']);
  expect(first.result.current[0]).toHaveLength(2);
  expect(second.result.current[0]).toHaveLength(2);
});

it('keeps unsaved strokes through another-tab notification and recovers after storage is available', async () => {
  const hook = renderHook(() => useAnnotationStrokes('A'));
  await waitFor(() => expect(hook.result.current[2]).toBe(true));
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  await act(async () => hook.result.current[1]([stroke]));
  act(() => window.dispatchEvent(new Event('storage')));
  expect(hook.result.current[0]).toEqual([stroke]);
  expect(hook.result.current[3].error).toContain('quota');
  write.mockRestore();
  await act(() => hook.result.current[3].retry());
  expect(readAnnotationDocument(annotationAccountKey('A')).strokes).toEqual([stroke]);
  expect(hook.result.current[3].error).toBeUndefined();
});
it('N02 isolates A → B → A and only automatically imports confirmed ownership', async () => {
  const source = JSON.stringify([
    { ...stroke, targetTaskId: 'a-task' },
    { ...stroke, id: 'global' },
    { ...stroke, id: 'orphan', targetTaskId: 'unknown' },
  ]);
  localStorage.setItem(ANNOTATION_STORAGE_KEY_V2, source);
  const hook = renderHook(({ owner, tasks }) => useAnnotationStrokes(owner, tasks), {
    initialProps: { owner: 'A', tasks: ids },
  });
  await waitFor(() => expect(hook.result.current[0]).toHaveLength(1));
  hook.rerender({ owner: 'B', tasks: [] });
  await waitFor(() => expect(hook.result.current[2]).toBe(true));
  expect(hook.result.current[0]).toHaveLength(0);
  hook.rerender({ owner: 'A', tasks: ids });
  await waitFor(() => expect(hook.result.current[0]).toHaveLength(1));
  await act(() => hook.result.current[3].importLegacy());
  await act(() => hook.result.current[3].importLegacy());
  expect(hook.result.current[0]).toHaveLength(3);
  expect(localStorage.getItem(ANNOTATION_STORAGE_KEY_V2)).toBe(source);
});
it('failed persistence leaves source and import markers recoverable', async () => {
  localStorage.setItem(ANNOTATION_STORAGE_KEY_V2, JSON.stringify([stroke]));
  const hook = renderHook(() => useAnnotationStrokes('A'));
  await waitFor(() => expect(hook.result.current[2]).toBe(true));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  await act(() => hook.result.current[3].importLegacy());
  expect(hook.result.current[3].error).toContain('quota');
  expect(readAnnotationDocument(annotationAccountKey('A')).imported).toEqual([]);
  expect(localStorage.getItem(ANNOTATION_STORAGE_KEY_V2)).not.toBeNull();
});
