/** @fileoverview 验证阶段估时解析、项目聚合、未填与零值、历史排除及完整圆环。 */
import { expect, test } from 'vitest';
import { stageTaskPayload } from '@/features/stage-plans/rules';
import { ringSector, stageTimeBreakdown } from '@/features/stage-plans/time-breakdown';
import type { Task, Project } from '@/types/domain';
const project: Project = {
  id: 'other',
  name: '其他',
  isFallback: true,
  color: '#ff0000',
  status: 'active',
  createdAt: '2026-10-01',
};
const base: Task = {
  id: 'a',
  title: '阅读',
  projectId: 'other',
  stagePlanId: 'stage',
  status: 'waiting',
  completed: false,
  importance: 'normal',
  createdAt: '2026-10-01',
  updatedAt: '2026-10-01',
};
test('validates optional estimates without changing task identity', () => {
  expect(
    stageTaskPayload({ id: 'a', title: '任务', estimateMinutes: '90' }),
  ).toMatchObject({ id: 'a', plannedDurationMinutes: 90 });
  expect(
    stageTaskPayload({ id: 'a', title: '任务', estimateMinutes: '' })
      .plannedDurationMinutes,
  ).toBeUndefined();
  expect(
    stageTaskPayload({ id: 'a', title: '任务', estimateMinutes: '0' })
      .plannedDurationMinutes,
  ).toBe(0);
  for (const estimateMinutes of ['-1', '1.5', '2147483648', 'NaN'])
    expect(() =>
      stageTaskPayload({ id: 'a', title: '任务', estimateMinutes }),
    ).toThrow();
});
test('separates estimate from actual, excludes history and keeps missing tasks visible', () => {
  const tasks = [
    { ...base, plannedDurationMinutes: 90, actualDurationMinutes: 20 },
    { ...base, id: 'b', plannedDurationMinutes: 30 },
    { ...base, id: 'c' },
    { ...base, id: 'd', plannedDurationMinutes: 0 },
    { ...base, id: 'deleted', status: 'trashed' as const, plannedDurationMinutes: 999 },
    { ...base, id: 'away', stagePlanId: 'elsewhere', plannedDurationMinutes: 999 },
  ];
  const planned = stageTimeBreakdown(tasks, [project], 'stage', 'planned');
  const actual = stageTimeBreakdown(tasks, [project], 'stage', 'actual');
  expect(planned.total).toBe(120);
  expect(planned.missing).toBe(1);
  expect(actual.total).toBe(20);
  expect(actual.missing).toBe(3);
  expect(planned.groups[0].items).toHaveLength(4);
  expect(planned.groups[0].color).toBe('#8792a2');
  expect(planned.groups[0].items.map((t) => t.color)).toEqual(
    actual.groups[0].items.map((t) => t.color),
  );
  expect(new Set(planned.groups[0].items.map((t) => t.color)).size).toBe(4);
  expect(stageTimeBreakdown([], [], 'stage', 'actual').total).toBe(0);
});
test('full-circle geometry uses two arcs per edge', () => {
  const path = ringSector(0, 1, 78, 107);
  expect(path.match(/ A/g)).toHaveLength(4);
  expect(path).not.toMatch(/NaN|Infinity/);
});
