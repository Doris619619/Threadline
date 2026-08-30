/** @fileoverview 验证 Calendar、Insights 与报告共享的 analytics 口径及旧记录降级规则。 */

import { describe, expect, it } from 'vitest';
import { createAnalyticsResult } from '@/lib/analytics';
import type { Project, Task } from '@/types/domain';

const projects: Project[] = [
  {
    id: 'research',
    name: '科研',
    color: '#38a774',
    status: 'active',
    createdAt: '2026-08-01',
  },
  {
    id: 'course',
    name: '课程',
    color: '#8b7cf6',
    status: 'active',
    createdAt: '2026-08-01',
  },
];
const task = (overrides: Partial<Task>): Task => ({
  id: 'task-1',
  projectId: 'research',
  title: '论文',
  date: '2026-08-20',
  completed: true,
  status: 'active',
  createdAt: '2026-08-20',
  updatedAt: '2026-08-20',
  ...overrides,
});

describe('analytics adapter', () => {
  it('uses actual-minutes project count for heat instead of completed task count', () => {
    const result = createAnalyticsResult({
      tasks: [
        task({ actualDurationMinutes: 100 }),
        task({ id: 'task-2', projectId: 'course', actualDurationMinutes: 30 }),
      ],
      projects,
      dailyByDate: {},
      dailyHistory: [],
      closeRecords: [],
      range: { start: '2026-08-20', end: '2026-08-20' },
    });
    expect(result.days[0]).toMatchObject({
      actualMinutes: 130,
      heatProjectCount: 2,
      quality: 'exact',
    });
  });

  it('keeps an unambiguous close record as a legacy aggregate without task inference', () => {
    const result = createAnalyticsResult({
      tasks: [],
      projects,
      dailyByDate: {},
      dailyHistory: [],
      closeRecords: [
        {
          id: 'close-1',
          date: '2026-08-20',
          closedAt: '2026-08-20T20:00:00',
          projectMinutes: { research: 180 },
        },
      ],
    });
    expect(result.entries).toEqual([
      expect.objectContaining({
        source: 'legacy-aggregate',
        quality: 'legacy-aggregate',
        actualMinutes: 180,
      }),
    ]);
  });

  it('does not subtract or merge a close aggregate when exact same-project data exists', () => {
    const result = createAnalyticsResult({
      tasks: [task({ actualDurationMinutes: 100 })],
      projects,
      dailyByDate: {},
      dailyHistory: [],
      closeRecords: [
        {
          id: 'close-1',
          date: '2026-08-20',
          closedAt: '2026-08-20T20:00:00',
          projectMinutes: { research: 180 },
        },
      ],
    });
    expect(result.totalActualMinutes).toBe(100);
    expect(result.entries).toHaveLength(1);
  });

  it('keeps reliable history when its project has since been deleted', () => {
    const result = createAnalyticsResult({
      tasks: [],
      projects: [projects[1]],
      dailyByDate: {},
      dailyHistory: [],
      closeRecords: [
        {
          id: 'close-1',
          date: '2026-08-20',
          closedAt: '2026-08-20T20:00:00',
          projectMinutes: { research: 180 },
        },
      ],
    });
    expect(result.projects).toEqual([
      expect.objectContaining({ projectId: 'research', actualMinutes: 180 }),
    ]);
  });

  it('includes an unrecorded Daily entry in current Insights and Calendar totals', () => {
    const result = createAnalyticsResult({
      tasks: [],
      projects,
      dailyByDate: {
        '2026-08-20': [
          {
            id: 'template-1',
            projectId: 'research',
            title: '阅读论文',
            actual: 45,
            completed: false,
          },
        ],
      },
      dailyHistory: [],
      closeRecords: [],
    });
    expect(result.totalActualMinutes).toBe(45);
    expect(result.days[0]?.dailyActualMinutes).toBe(45);
  });

  it('deduplicates a formal Daily record and its same template/date entry', () => {
    const result = createAnalyticsResult({
      tasks: [],
      projects,
      dailyByDate: {
        '2026-08-20': [
          {
            id: 'template-1',
            projectId: 'research',
            title: '阅读论文',
            actual: 99,
            completed: true,
          },
        ],
      },
      dailyHistory: [
        {
          dailyId: 'template-1',
          projectId: 'research',
          date: '2026-08-20',
          completed: true,
          actual: 45,
          result: '已记录',
        },
      ],
      closeRecords: [],
    });
    expect(result.totalActualMinutes).toBe(45);
    expect(result.entries.filter((entry) => entry.source === 'daily')).toHaveLength(1);
    expect(result.entries[0]?.id).toBe('daily-history:template-1:2026-08-20');
  });
});
