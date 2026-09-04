/** @fileoverview 验证工作台以显式能力区分云端 ledger 真源与测试 aggregate fallback。 */

import { describe, expect, it } from 'vitest';
import { useTaskDashboardData } from '@/features/tasks/hooks/use-task-dashboard-data';
import type { Project, Task } from '@/types/domain';

const projects: Project[] = [
  {
    id: 'research',
    name: '科研',
    color: '#4f8cff',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

const tasks: Task[] = [
  {
    id: 'task-1',
    projectId: 'research',
    title: '旧 aggregate',
    date: '2026-08-31',
    actualDurationMinutes: 120,
    completed: false,
    status: 'active',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
  },
];

const sharedInput = {
  tasks,
  taskTimeEntries: [],
  projects,
  dailyByDate: {},
  dailyHistory: [],
  closeRecords: [],
  selectedDate: '2026-08-31',
};

describe('task dashboard time source capability', () => {
  it('treats an empty cloud ledger as authoritative', () => {
    const result = useTaskDashboardData({
      ...sharedInput,
      taskTimeEntriesAuthoritative: true,
    });

    expect(result.actual).toBe(0);
    expect(result.analyticsInput.taskTimeEntries).toEqual([]);
  });

  it('allows the explicit test adapter to fall back to task aggregates', () => {
    const result = useTaskDashboardData({
      ...sharedInput,
      taskTimeEntriesAuthoritative: false,
    });

    expect(result.actual).toBe(120);
    expect(result.analyticsInput.taskTimeEntries).toBeUndefined();
  });

  it('places tasks with a start time before time-pending tasks in today schedule', () => {
    const result = useTaskDashboardData({
      ...sharedInput,
      taskTimeEntriesAuthoritative: false,
      tasks: [
        { ...tasks[0], id: 'pending-time', schedulePendingTime: true },
        {
          ...tasks[0],
          id: 'afternoon',
          plannedStartTime: '14:00',
          schedulePendingTime: false,
        },
        {
          ...tasks[0],
          id: 'morning',
          plannedStartTime: '09:00',
          schedulePendingTime: false,
        },
      ],
    });

    expect(result.timed.map((task) => task.id)).toEqual([
      'morning',
      'afternoon',
      'pending-time',
    ]);
  });

  it('keeps waiting tasks visible across selected dates without treating time fields as ownership', () => {
    const waiting: Task = {
      ...tasks[0],
      id: 'waiting-important',
      status: 'waiting',
      date: undefined,
      schedulePendingTime: false,
      importance: 'important',
    };
    const result = useTaskDashboardData({
      ...sharedInput,
      selectedDate: '2026-09-02',
      taskTimeEntriesAuthoritative: false,
      tasks: [waiting, { ...tasks[0], id: 'scheduled', date: '2026-09-02', schedulePendingTime: false }],
    });

    expect(result.waiting).toEqual([waiting]);
    expect(result.shown.map((task) => task.id)).toEqual(['scheduled']);
    expect(result.normalTaskTotal).toBe(1);
  });
});
