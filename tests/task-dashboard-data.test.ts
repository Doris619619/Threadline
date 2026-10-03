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
    importance: 'normal',
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
  it('sums unfinished task and Daily child estimates without subtracting actual, reporting unknown estimates', () => {
    const result = useTaskDashboardData({
      ...sharedInput,
      taskTimeEntriesAuthoritative: false,
      tasks: [
        { ...tasks[0], plannedDurationMinutes: 60 },
        { ...tasks[0], id: 'done', completed: true, plannedDurationMinutes: 99 },
        { ...tasks[0], id: 'unknown' },
      ],
      dailyByDate: {
        '2026-08-31': [
          {
            id: 'daily',
            title: '训练',
            completed: true,
            actual: 10,
            result: '',
            children: [
              {
                title: '已做',
                completed: true,
                actual: 20,
                plannedDurationMinutes: 30,
              },
              {
                title: '待做',
                completed: false,
                actual: 0,
                plannedDurationMinutes: 20,
              },
              { title: '零值', completed: false, actual: 0, plannedDurationMinutes: 0 },
            ],
          },
        ],
      },
    });
    expect(result.remainingPlannedMinutes).toBe(80);
    expect(result.remainingMissingCount).toBe(1);
    expect(result.totalPlannedMinutes).toBe(209);
    expect(result.totalMissingCount).toBe(1);
    expect(result.dailyActual).toBe(30);
  });
  it('keeps zero estimates known, includes completed childless Daily as unknown total, and excludes other dates and inactive tasks', () => {
    const result = useTaskDashboardData({
      ...sharedInput,
      taskTimeEntriesAuthoritative: true,
      tasks: [
        { ...tasks[0], plannedDurationMinutes: 0 },
        { ...tasks[0], id: 'done', completed: true, plannedDurationMinutes: 20 },
        {
          ...tasks[0],
          id: 'other-day',
          date: '2026-09-01',
          plannedDurationMinutes: 99,
        },
        { ...tasks[0], id: 'waiting', status: 'waiting', plannedDurationMinutes: 99 },
        { ...tasks[0], id: 'trashed', status: 'trashed', plannedDurationMinutes: 99 },
      ],
      dailyByDate: {
        '2026-08-31': [
          {
            id: 'done-empty',
            title: '已做',
            completed: true,
            children: [],
            actual: 0,
            result: '',
          },
          {
            id: 'unfinished-empty',
            title: '未做',
            completed: false,
            children: [],
            actual: 0,
            result: '',
          },
        ],
        '2026-09-01': [
          {
            id: 'other',
            title: '另一天',
            completed: false,
            children: [
              {
                title: '另一天',
                plannedDurationMinutes: 99,
                completed: false,
                actual: 0,
              },
            ],
            actual: 0,
            result: '',
          },
        ],
      },
    });
    expect(result.totalPlannedMinutes).toBe(20);
    expect(result.remainingPlannedMinutes).toBe(0);
    expect(result.totalMissingCount).toBe(2);
    expect(result.remainingMissingCount).toBe(1);
  });
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

  it('keeps every active task on the selected date visible, with timed tasks first', () => {
    const result = useTaskDashboardData({
      ...sharedInput,
      taskTimeEntriesAuthoritative: false,
      tasks: [
        { ...tasks[0], id: 'pending-time', schedulePendingTime: true },
        { ...tasks[0], id: 'untimed', schedulePendingTime: false },
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
      'untimed',
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
      tasks: [
        waiting,
        {
          ...tasks[0],
          id: 'scheduled',
          date: '2026-09-02',
          schedulePendingTime: false,
        },
      ],
    });

    expect(result.waiting).toEqual([waiting]);
    expect(result.shown.map((task) => task.id)).toEqual(['scheduled']);
    expect(result.normalTaskTotal).toBe(1);
  });
});
