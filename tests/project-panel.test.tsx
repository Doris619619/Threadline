/** @fileoverview 验证项目累计投入按 ledger 的历史项目归属统计，并保留测试 fallback。 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectPanel } from '@/features/projects/project-panel';
import type { Project, Task, TaskTimeEntry } from '@/types/domain';

const projects: Project[] = [
  {
    id: 'research',
    name: '科研',
    color: '#4f8cff',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'course',
    name: '课程',
    color: '#8b7cf6',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

const tasks: Task[] = [
  {
    id: 'task-1',
    projectId: 'course',
    title: '已改派任务',
    date: '2026-08-31',
    actualDurationMinutes: 120,
    completed: true,
    status: 'active',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
  },
];

const taskTimeEntries: TaskTimeEntry[] = [
  {
    id: 'time-1',
    taskId: 'task-1',
    projectId: 'research',
    date: '2026-08-30',
    minutes: 40,
  },
  {
    id: 'time-2',
    taskId: 'task-1',
    projectId: 'research',
    date: '2026-08-31',
    minutes: 80,
  },
];

/** 渲染无 Daily 干扰的项目页，并返回对应项目行。 */
function renderProjectPanel(taskTimeEntriesAuthoritative: boolean) {
  render(
    <ProjectPanel
      items={projects}
      tasks={tasks}
      taskTimeEntries={taskTimeEntries}
      taskTimeEntriesAuthoritative={taskTimeEntriesAuthoritative}
      daily={[]}
      dailyHistory={[]}
      onChange={vi.fn()}
    />,
  );
  return {
    research: screen.getByRole('button', { name: '【科研】' }).closest('.project-row'),
    course: screen.getByRole('button', { name: '【课程】' }).closest('.project-row'),
  };
}

afterEach(cleanup);

describe('ProjectPanel task actual source', () => {
  it('keeps historical minutes on the ledger project after the task is reassigned', () => {
    const rows = renderProjectPanel(true);

    expect(rows.research).toHaveTextContent('累计 120min');
    expect(rows.course).toHaveTextContent('累计 0min');
    fireEvent.click(screen.getByRole('button', { name: '【科研】' }));
    expect(screen.getByText('120min')).toBeVisible();
  });

  it('uses current task aggregates only in explicit fallback mode', () => {
    const rows = renderProjectPanel(false);

    expect(rows.research).toHaveTextContent('累计 0min');
    expect(rows.course).toHaveTextContent('累计 120min');
  });
});
