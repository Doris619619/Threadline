/** @fileoverview 验证时间轴使用真实起止时间，并覆盖短任务碰撞、密集分栏与午夜边界。 */
import { describe, expect, it } from 'vitest';
import {
  layoutPlanningTimeline,
  planningMinutes,
} from '@/features/calendar/planning-timeline-layout';
import type { Task } from '@/types/domain';

/** 用最小任务结构明确指定时间，预计投入刻意与时间跨度不同。 */
function task(id: string, start?: string, end?: string): Task {
  return {
    id,
    title: id,
    projectId: 'p',
    status: 'active',
    completed: false,
    importance: 'normal',
    createdAt: '',
    updatedAt: '',
    plannedStartTime: start,
    plannedEndTime: end,
    plannedDurationMinutes: 240,
  };
}

describe('planning timeline', () => {
  it('uses explicit times without converting independent estimates into end times', () => {
    const layout = layoutPlanningTimeline([
      task('known', '09:00', '10:00'),
      task('unknown', '11:00'),
    ]);
    expect(layout.groups[0].events[0]).toMatchObject({
      start: 540,
      end: 600,
      displayEnd: 600,
    });
    expect(layout.groups[1].events[0]).toMatchObject({
      start: 660,
      end: undefined,
      displayEnd: 690,
    });
  });
  it('keeps short adjacent click targets apart and reuses lanes within a connected group', () => {
    const layout = layoutPlanningTimeline([
      task('long', '09:00', '11:00'),
      task('short', '09:05', '09:10'),
      task('nearby', '09:15', '09:20'),
      task('later', '10:00', '10:30'),
    ]);
    expect(layout.groups).toHaveLength(1);
    expect(layout.groups[0].columns).toBe(3);
    expect(layout.groups[0].events.map((event) => event.column)).toEqual([0, 1, 2, 1]);
    expect(layout.groups[0].events[1].end).toBe(550);
  });
  it('separates adjacent full blocks and marks dense groups for an aggregate entry', () => {
    expect(
      layoutPlanningTimeline([task('a', '09:00', '10:00'), task('b', '10:00', '11:00')])
        .groups,
    ).toHaveLength(2);
    const dense = layoutPlanningTimeline(
      Array.from({ length: 6 }, (_, i) => task(String(i), '09:00', '10:00')),
    );
    expect(dense.groups[0].columns).toBe(6);
    expect(dense.groups[0].events).toHaveLength(6);
  });
  it('includes early and late tasks without fabricating next-day tasks', () => {
    const layout = layoutPlanningTimeline([
      task('early', '00:05', '01:00'),
      task('late', '23:55'),
    ]);
    expect(layout.start).toBe(0);
    expect(layout.end).toBe(1500);
    expect(layout.groups[1].events[0]).toMatchObject({ start: 1435, end: undefined });
  });
  it('ignores invalid starts and treats invalid ends as unknown', () => {
    expect(planningMinutes('24:00')).toBeUndefined();
    expect(planningMinutes('09:60')).toBeUndefined();
    const layout = layoutPlanningTimeline([
      task('missing'),
      task('invalid', 'wrong'),
      task('backward', '11:00', '10:00'),
    ]);
    expect(layout.groups).toHaveLength(1);
    expect(layout.groups[0].events[0].end).toBeUndefined();
  });
});
