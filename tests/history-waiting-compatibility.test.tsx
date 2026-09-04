/** @fileoverview 验证 waiting 新事件与 backlog 历史事件在 History 中保持可读兼容。 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryPanel } from '@/features/history/history-panel';
import type { HistoryEvent, Task } from '@/types/domain';

const task: Task = {
  id: 'task-1', projectId: 'project-1', title: '历史任务', date: '2026-09-04',
  completed: false, status: 'active', importance: 'normal', createdAt: '2026-09-04', updatedAt: '2026-09-04',
};
const history: HistoryEvent[] = [
  { id: 'legacy-backlog', taskId: task.id, type: 'backlog', occurredAt: '2026-09-04T02:00:00.000Z' },
  { id: 'legacy-close', taskId: task.id, type: 'close_backlog', occurredAt: '2026-09-04T02:00:00.000Z' },
  { id: 'scheduled-first', taskId: task.id, type: 'scheduled', occurredAt: '2026-09-04T02:00:00.000Z', payload: { toDate: '2026-09-05' } },
];

describe('HistoryPanel waiting compatibility', () => {
  it('renders legacy backlog labels and keeps a first scheduled event original date as a dash', () => {
    render(
      <HistoryPanel
        tasks={[task]}
        history={history}
        closeRecords={[]}
        dailyHistory={[]}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText('待安排')).toBeVisible();
    expect(screen.getByText('收尾：待安排')).toBeVisible();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
