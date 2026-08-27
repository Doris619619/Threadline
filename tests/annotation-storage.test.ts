/** @fileoverview 验证 Annotation v1 的单向日期迁移和 v2 可见性规则。 */

import { describe, expect, it } from 'vitest';
import {
  isAnnotationVisibleOnDate,
  migrateLegacyAnnotationStrokes,
  normalizeAnnotationStrokes,
} from '@/lib/annotation-storage';

const legacyToday = {
  id: 'legacy-today',
  points: [{ x: 0.2, y: 0.4 }],
  color: '#ff0',
  strokeWidth: 16,
  createdAt: '2026-08-23T04:00:00.000Z',
  targetScope: 'today',
  targetTaskId: 'task-1',
};

describe('annotation storage', () => {
  it('migrates legacy today strokes only to the local upgrade date and preserves targetTaskId', () => {
    expect(migrateLegacyAnnotationStrokes([legacyToday], '2026-08-27')).toEqual([
      {
        ...legacyToday,
        targetScope: 'date',
        targetDate: '2026-08-27',
      },
    ]);
  });

  it('preserves legacy global strokes without attaching a date', () => {
    expect(
      migrateLegacyAnnotationStrokes(
        [{ ...legacyToday, targetScope: 'global' }],
        '2026-08-27',
      ),
    ).toEqual([{ ...legacyToday, targetScope: 'global' }]);
  });

  it('drops malformed strokes and only shows exact-date or global v2 strokes', () => {
    const strokes = normalizeAnnotationStrokes([
      { ...legacyToday, targetScope: 'date', targetDate: '2026-08-27' },
      { ...legacyToday, id: 'global', targetScope: 'global' },
      { id: 'broken', targetScope: 'date', targetDate: '2026-08-27' },
    ]);

    expect(strokes).toHaveLength(2);
    expect(isAnnotationVisibleOnDate(strokes[0], '2026-08-27')).toBe(true);
    expect(isAnnotationVisibleOnDate(strokes[0], '2026-08-28')).toBe(false);
    expect(isAnnotationVisibleOnDate(strokes[1], '2026-08-28')).toBe(true);
  });
});
