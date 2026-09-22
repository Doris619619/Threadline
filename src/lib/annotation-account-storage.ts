/** @fileoverview 按环境与账号保存批注；原子写入导入凭据，永不删除旧版源数据。 */
import {
  ANNOTATION_STORAGE_KEY_V1,
  ANNOTATION_STORAGE_KEY_V2,
  migrateLegacyAnnotationStrokes,
  normalizeAnnotationStrokes,
} from './annotation-storage';
import { workspaceStorageKey } from './workspace-runtime';
import type { AnnotationStroke } from '@/types/domain';
export type AnnotationDocument = { strokes: AnnotationStroke[]; imported: string[] };
/** 同源的测试、预览与不同云项目使用不同账号空间。 */
export function annotationAccountKey(owner: string): string {
  const environment =
    owner === 'local' ? 'local' : (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'cloud');
  return workspaceStorageKey(
    `threadline.annotations.v3:${encodeURIComponent(environment)}:${encodeURIComponent(owner)}`,
  );
}
/** 损坏数据报错而不删除，让用户仍可导出和恢复源数据。 */
export function readAnnotationDocument(key: string): AnnotationDocument {
  const raw = localStorage.getItem(key);
  if (!raw) return { strokes: [], imported: [] };
  const value = JSON.parse(raw) as AnnotationDocument;
  if (!Array.isArray(value.strokes) || !Array.isArray(value.imported))
    throw new Error('批注存储损坏，请保留本机数据并重试。');
  return {
    strokes: normalizeAnnotationStrokes(value.strokes),
    imported: value.imported,
  };
}
/** 两代源都保留；v2 已迁移笔迹沿用 v1 ID，优先采用 v2 的固定日期并按原 ID 去重。 */
export function readLegacyAnnotations() {
  const seen = new Set<string>();
  return [ANNOTATION_STORAGE_KEY_V2, ANNOTATION_STORAGE_KEY_V1].flatMap((key) => {
    const raw = localStorage.getItem(workspaceStorageKey(key));
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    const strokes =
      key === ANNOTATION_STORAGE_KEY_V1
        ? migrateLegacyAnnotationStrokes(value)
        : normalizeAnnotationStrokes(value);
    return strokes.flatMap((stroke) => {
      if (seen.has(stroke.id)) return [];
      seen.add(stroke.id);
      return [{ source: `stroke:${stroke.id}`, stroke }];
    });
  });
}
/** 同一次 setItem 提交笔迹和凭据；写入失败不会留下已导入标记。 */
export async function changeAnnotationDocument(
  key: string,
  active: () => boolean,
  change: (document: AnnotationDocument) => AnnotationDocument,
): Promise<AnnotationDocument | undefined> {
  const write = () => {
    if (!active()) return undefined;
    const next = change(readAnnotationDocument(key));
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('threadline-annotations', { detail: key }));
    return next;
  };
  return navigator.locks ? navigator.locks.request(key, write) : write();
}
/** 按来源去重，不覆盖当前笔迹；显式导入孤立笔迹时移除无法确认的任务绑定。 */
export function importAnnotationDocument(
  document: AnnotationDocument,
  allowed: Set<string>,
  explicit: boolean,
): AnnotationDocument {
  const strokes = [...document.strokes];
  const imported = new Set(document.imported);
  for (const { source, stroke } of readLegacyAnnotations()) {
    if (
      imported.has(source) ||
      (!explicit && (!stroke.targetTaskId || !allowed.has(stroke.targetTaskId)))
    )
      continue;
    const id = `legacy:${source}`;
    if (!strokes.some((item) => item.id === id))
      strokes.push({
        ...stroke,
        id,
        targetTaskId:
          stroke.targetTaskId && allowed.has(stroke.targetTaskId)
            ? stroke.targetTaskId
            : undefined,
      });
    imported.add(source);
  }
  return { strokes, imported: [...imported] };
}
