/** @fileoverview 验证记录页只使用流转事件且将 ISO instant 映射为本地业务日期。 */

import { describe, expect, it } from 'vitest';
import { buildRecordRows } from '@/features/records/records-panel';
import type { HistoryEvent, Project, Task } from '@/types/domain';

/** 构建测试所需的最小完整任务，确保映射行为不依赖 UI。 */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    projectId: 'work',
    title: '整理记录',
    completed: false,
    status: 'active',
    createdAt: '2026-08-28T08:00:00.000Z',
    updatedAt: '2026-08-28T08:00:00.000Z',
    ...overrides,
  };
}

const projects: Project[] = [
  {
    id: 'work',
    name: '工作',
    color: '#4f8cff',
    status: 'active',
    createdAt: '2026-08-01',
  },
];

describe('record rows', () => {
  it('uses one HistoryEvent instead of duplicating a non-active task snapshot', () => {
    const task = makeTask({ status: 'abandoned' });
    const history: HistoryEvent[] = [
      {
        id: 'history-1',
        taskId: task.id,
        type: 'abandoned',
        occurredAt: '2026-08-28T16:30:00.000Z',
        payload: { fromDate: '2026-08-29' },
      },
    ];

    const rows = buildRecordRows([task], projects, history, [], []);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'history:history-1', detail: '放弃' });
  });

  it('uses a completed timestamp as a local business date when no task date exists', () => {
    const localMidnight = new Date(2026, 7, 29, 0, 30);
    const task = makeTask({
      completed: true,
      completedAt: localMidnight.toISOString(),
    });

    const rows = buildRecordRows([task], projects, [], [], []);

    expect(rows[0]?.date).toBe('2026-08-29');
  });
});
