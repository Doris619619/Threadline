/** @fileoverview 验证规划计数、未知估时和提前改期的日期边界。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  groupPlanningTasks,
  planningDay,
  planningHeat,
} from '@/features/calendar/planning-rules';
import { validatePlanningDate } from '@/lib/task-rules';
import { getWeekRange, iterateLocalDateRange } from '@/lib/date-range';
import type { Task } from '@/types/domain';

/** 提供普通任务，测试显式覆盖会影响分组的字段。 */
function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    projectId: 'p',
    status: 'active',
    date: '2026-09-08',
    completed: false,
    importance: 'normal',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}
describe('planning', () => {
  it('uses bounded heat levels without capping the actual task count', () => {
    expect([0, 1, 2, 3, 4, 5, 7, 8, 12, 100].map(planningHeat)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 4,
    ]);
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());
  it('keeps completed tasks and excludes waiting, trash and the old reschedule date', () => {
    const days = groupPlanningTasks([
      task('a'),
      task('b', { completed: true }),
      task('c', { status: 'waiting' }),
      task('d', { status: 'trashed' }),
      task('e', { date: '2026-09-09', postponedFrom: '2026-09-08' }),
    ]);
    expect(days.get('2026-09-08')?.map((t) => t.id)).toEqual(['a', 'b']);
    expect(days.get('2026-09-09')?.map((t) => t.id)).toEqual(['e']);
  });
  it('sorts timed work and counts missing estimates separately from zero and completed work', () => {
    const day = planningDay([
      task('late', { plannedStartTime: '14:00', plannedDurationMinutes: 60 }),
      task('early', { plannedStartTime: '09:00', plannedDurationMinutes: 0 }),
      task('unknown'),
      task('done', { completed: true, plannedDurationMinutes: 200 }),
    ]);
    expect(day.timed.map((t) => t.id)).toEqual(['early', 'late']);
    expect(day.estimated).toBe(60);
    expect(day.unestimated).toBe(1);
    expect(day.completed).toHaveLength(1);
    expect(day.untimed).toHaveLength(1);
  });
  it('allows bringing future tasks forward to today and rejects past, same and invalid dates', () => {
    expect(validatePlanningDate('2026-09-06', '2026-09-11')).toBeUndefined();
    expect(validatePlanningDate('2026-09-09', '2026-09-11')).toBeUndefined();
    expect(validatePlanningDate('2026-09-15', '2026-09-11')).toBeUndefined();
    expect(validatePlanningDate('2026-09-05')).toBe('请选择今天或未来日期');
    expect(validatePlanningDate('2026-09-11', '2026-09-11')).toBe(
      '请选择与原日期不同的日期',
    );
    expect(validatePlanningDate('2026-02-30')).toBe('请选择有效日期');
  });
  it('keeps Monday weeks across year boundaries', () => {
    expect(iterateLocalDateRange(getWeekRange('2027-01-01'))).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });
});
