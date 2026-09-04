/** @fileoverview 验证重连后只按 owner 的全部云端 task identity 清理本机任务 Annotation。 */

import { describe, expect, it } from 'vitest';
import { reconcileTaskAnnotations } from '@/lib/annotation-reconciliation';
import type { AnnotationStroke, Task } from '@/types/domain';

/** 创建全局或 task-targeted 日期笔迹，保持真实 AnnotationStroke shape。 */
const stroke = (id: string, targetTaskId?: string): AnnotationStroke => {
  const base = {
    id,
    color: '#ffff00',
    strokeWidth: 8,
    points: [{ x: 0.1, y: 0.2 }],
    createdAt: new Date().toISOString(),
  };
  return targetTaskId
    ? {
        ...base,
        targetScope: 'date',
        targetDate: '2026-08-30',
        targetTaskId,
      }
    : { ...base, targetScope: 'global' };
};

/** 创建仅含 reconciliation 所需字段的完整 Task fixture。 */
const task = (id: string, status: Task['status'], date?: string): Task => ({
  id,
  projectId: crypto.randomUUID(),
  title: id,
  date,
  completed: false,
  status,
  importance: 'normal',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('annotation reconnect reconciliation', () => {
  it('keeps active tasks from every date and removes trashed or purged identities', () => {
    const result = reconcileTaskAnnotations(
      [
        stroke('global'),
        stroke('today-active', 'today'),
        stroke('other-date-active', 'other-date'),
        stroke('trashed', 'trashed'),
        stroke('purged-offline', 'missing'),
      ],
      [
        task('today', 'active', '2026-08-30'),
        task('other-date', 'active', '2026-09-01'),
        task('trashed', 'trashed'),
      ],
    );

    expect(result.map((item) => item.id)).toEqual([
      'global',
      'today-active',
      'other-date-active',
    ]);
  });
});
