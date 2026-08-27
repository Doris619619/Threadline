/**
 * @fileoverview 定义日期化 Annotation v2 的解析与 v1 单向迁移，不把领域迁移泛化到通用持久化层。
 */

import { getLocalDateKey } from '@/lib/local-date';
import type { AnnotationPoint, AnnotationStroke } from '@/types/domain';

export const ANNOTATION_STORAGE_KEY_V1 = 'threadline.annotations.v1';
export const ANNOTATION_STORAGE_KEY_V2 = 'threadline.annotations.v2';

type LegacyAnnotationStroke = {
  id?: unknown;
  points?: unknown;
  color?: unknown;
  strokeWidth?: unknown;
  createdAt?: unknown;
  targetScope?: unknown;
  targetTaskId?: unknown;
};

/** 只接受有限坐标，避免损坏的 localStorage 笔迹破坏 SVG 渲染。 */
function normalizePoints(value: unknown): AnnotationPoint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const points = value.flatMap((point) => {
    if (!point || typeof point !== 'object') return [];
    const candidate = point as Partial<AnnotationPoint>;
    const { x, y } = candidate;
    if (typeof x !== 'number' || typeof y !== 'number') return [];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }];
  });
  return points.length > 0 ? points : undefined;
}

/** 规范化共享的笔迹字段，并保留合法 targetTaskId。 */
function normalizeStrokeBase(value: LegacyAnnotationStroke) {
  const points = normalizePoints(value.points);
  if (
    typeof value.id !== 'string' ||
    !points ||
    typeof value.color !== 'string' ||
    typeof value.strokeWidth !== 'number' ||
    !Number.isFinite(value.strokeWidth) ||
    typeof value.createdAt !== 'string'
  )
    return undefined;
  return {
    id: value.id,
    points,
    color: value.color,
    strokeWidth: Math.max(1, Math.min(96, value.strokeWidth)),
    createdAt: value.createdAt,
    ...(typeof value.targetTaskId === 'string'
      ? { targetTaskId: value.targetTaskId }
      : {}),
  };
}

/** 读取 v2 数组时丢弃非法记录，不因单条脏数据影响其余笔迹。 */
export function normalizeAnnotationStrokes(value: unknown): AnnotationStroke[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<AnnotationStroke>((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as LegacyAnnotationStroke & { targetDate?: unknown };
    const base = normalizeStrokeBase(candidate);
    if (!base) return [];
    if (candidate.targetScope === 'global') return [{ ...base, targetScope: 'global' }];
    if (candidate.targetScope === 'date' && typeof candidate.targetDate === 'string')
      return [{ ...base, targetScope: 'date', targetDate: candidate.targetDate }];
    return [];
  });
}

/** 将 v1 的 today 语义固定到升级当天；绝不复制到其他日期，也不删除旧 key。 */
export function migrateLegacyAnnotationStrokes(
  value: unknown,
  upgradeDate = getLocalDateKey(),
): AnnotationStroke[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<AnnotationStroke>((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as LegacyAnnotationStroke;
    const base = normalizeStrokeBase(candidate);
    if (!base) return [];
    if (candidate.targetScope === 'global') return [{ ...base, targetScope: 'global' }];
    if (candidate.targetScope === 'today')
      return [{ ...base, targetScope: 'date', targetDate: upgradeDate }];
    return [];
  });
}

/** 判断笔迹是否属于当前日程画布；global 笔迹始终可见，日期笔迹必须精确匹配。 */
export function isAnnotationVisibleOnDate(
  stroke: AnnotationStroke,
  date: string,
): boolean {
  return stroke.targetScope === 'global' || stroke.targetDate === date;
}
