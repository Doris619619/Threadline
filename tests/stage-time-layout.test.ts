/** @fileoverview 验证项目分组、三种时间口径、极小扇区与可增长的外置标签布局。 */
import { expect, test } from 'vitest';
import { stageProjectGroups } from '@/features/stage-plans/project-groups';
import {
  stageTimeBreakdown,
  stageTimeSectors,
} from '@/features/stage-plans/time-breakdown';
import { stageTimeLabelLayout } from '@/features/stage-plans/time-label-layout';
import { adjustTaskActualEntries } from '@/lib/task-actual-entries';
import type { Task, Project } from '@/types/domain';
const base: Task = {
  id: 't',
  title: '很长的任务名称'.repeat(12),
  projectId: 'p',
  stagePlanId: 's',
  status: 'waiting',
  completed: false,
  createdAt: '2026-10-01',
  updatedAt: '2026-10-01',
};
const projects: Project[] = [
  {
    id: 'o',
    name: '其他',
    isFallback: true,
    color: '#888888',
    position: 0,
    status: 'active',
    createdAt: '',
  },
  {
    id: 'p',
    name: '课程',
    color: '#8877ee',
    position: 2,
    status: 'active',
    createdAt: '',
  },
  {
    id: 'a',
    name: '归档研究',
    color: '#33bbcc',
    position: 1,
    status: 'archived',
    createdAt: '',
  },
];
test('project order includes archived references, puts fallback last and preserves task order', () => {
  const rows = [
    { ...base, id: 'o', projectId: 'o' },
    base,
    { ...base, id: 'a', projectId: 'a' },
    { ...base, id: 't2' },
  ];
  const groups = stageProjectGroups(rows, projects);
  expect(groups.map((g) => g.id)).toEqual(['a', 'p', 'o']);
  expect(groups[1].tasks.map((t) => t.id)).toEqual(['t', 't2']);
});
test('remaining retains overdue/unassigned estimates and does not subtract actual', () => {
  const tasks = [
    { ...base, plannedDurationMinutes: 30, actualDurationMinutes: 20 },
    {
      ...base,
      id: 'late',
      status: 'active' as const,
      date: '2026-10-01',
      plannedDurationMinutes: 90,
      actualDurationMinutes: 110,
    },
    { ...base, id: 'done', completed: true, plannedDurationMinutes: 60 },
    { ...base, id: 'zero', plannedDurationMinutes: 0 },
    { ...base, id: 'missing' },
  ];
  expect(stageTimeBreakdown(tasks, projects, 's', 'planned').total).toBe(180);
  const remaining = stageTimeBreakdown(tasks, projects, 's', 'remaining');
  expect(remaining.total).toBe(120);
  expect(remaining.missing).toBe(1);
  expect(stageTimeSectors(remaining.groups, remaining.total)).toHaveLength(2);
});
test.each([280, 320, 390, 900])(
  'labels every positive task at width %s without collisions or distorted slices',
  (width) => {
    const tasks = Array.from({ length: 27 }, (_, i) => ({
      ...base,
      id: String(i),
      plannedDurationMinutes: i === 0 ? 2000000 : i + 1,
    }));
    const data = stageTimeBreakdown(tasks, projects, 's', 'planned');
    const sectors = stageTimeSectors(data.groups, data.total);
    expect(sectors).toHaveLength(27);
    expect(sectors.find((s) => s.id === '1')!.fraction).toBe(2 / data.total);
    const layout = stageTimeLabelLayout(
      sectors,
      width,
      Object.fromEntries(tasks.map((t) => [t.id, 72])),
    );
    expect(layout.labels).toHaveLength(27);
    expect(layout.height).toBeGreaterThan(27 * 30);
    expect(layout.cy - layout.outer).toBe(20);
    expect(layout.cy + layout.outer).toBeLessThanOrEqual(layout.height);
    for (const side of [-1, 1]) {
      const labels = layout.labels
        .filter((label) => label.side === side)
        .sort((a, b) => a.y - b.y);
      labels.forEach((label, i) => {
        expect(label.y).toBeGreaterThanOrEqual(0);
        expect(label.y + label.height).toBeLessThanOrEqual(layout.height);
        expect(label.x + label.width).toBeLessThanOrEqual(width);
        expect(label.points).not.toMatch(/NaN|Infinity/);
        if (i)
          expect(label.y).toBeGreaterThanOrEqual(
            labels[i - 1].y + labels[i - 1].height + 8,
          );
      });
    }
  },
);
test('day actual uses dated ledger even after scheduling changes and task removal', () => {
  const data = stageTimeBreakdown(
    [{ ...base, status: 'active', date: '2026-10-07', actualDurationMinutes: 100 }],
    projects,
    undefined,
    'actual',
    {
      date: '2026-10-04',
      entries: [
        { id: 'e', taskId: 't', date: '2026-10-04', projectId: 'p', minutes: 15 },
        { id: 'old', date: '2026-10-04', projectId: 'p', minutes: 5 },
      ],
    },
  );
  expect(data.total).toBe(20);
  expect(stageTimeSectors(data.groups, data.total)).toHaveLength(2);
});
test('local actual recording preserves dated history and rejects reductions against other dates', () => {
  const first = adjustTaskActualEntries(base, 15, '2026-10-03', []);
  const next = { ...base, actualDurationMinutes: 15 };
  const entries = adjustTaskActualEntries(next, 25, '2026-10-04', first);
  expect(entries.map((e) => e.minutes)).toEqual([15, 10]);
  expect(() =>
    adjustTaskActualEntries(
      { ...next, actualDurationMinutes: 25 },
      0,
      '2026-10-04',
      entries,
    ),
  ).toThrow('历史');
  expect(
    adjustTaskActualEntries(
      { ...next, actualDurationMinutes: 25 },
      20,
      '2026-10-04',
      entries,
    ).map((e) => e.minutes),
  ).toEqual([15, 5]);
  expect(adjustTaskActualEntries(base, 0, '2026-10-04', [])).toEqual([]);
  expect(
    adjustTaskActualEntries(
      { ...base, actualDurationMinutes: 15 },
      undefined,
      '2026-10-03',
      first,
    )[0].minutes,
  ).toBe(0);
});
