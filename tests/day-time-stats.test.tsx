/** @fileoverview 验证首页预计仅统计日程，Daily 预计不增加顶部分钟，但已记录实际仍计入。 */

import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DayTimeStats } from '@/features/tasks/components/day-time-stats';
import { useTaskDashboardData } from '@/features/tasks/hooks/use-task-dashboard-data';
import { createDemoDailies } from '@/features/workspace/demo-seed';
import type { Daily } from '@/features/daily/types';
import type { Task } from '@/types/domain';

afterEach(cleanup);

/** 用真实首页派生数据渲染统计栏；日程与 Daily 快照独立传入以验证不同统计范围。 */
function renderStats(daily: Daily[] = [], tasks: Task[] = []) {
  const { result } = renderHook(() =>
    useTaskDashboardData({
      tasks,
      taskTimeEntries: [],
      taskTimeEntriesAuthoritative: true,
      projects: [],
      dailyByDate: { '2026-11-19': daily },
      dailyHistory: [],
      closeRecords: [],
      selectedDate: '2026-11-19',
    }),
  );
  const data = result.current;
  const view = render(
    <DayTimeStats
      remaining={data.remainingPlannedMinutes}
      total={data.totalPlannedMinutes}
      actual={data.actual + data.dailyActual}
      remainingMissing={data.remainingMissingCount}
      totalMissing={data.totalMissingCount}
    />,
  );
  return { ...view, data };
}

describe('home time statistics scope', () => {
  it('shows zero estimates and zero actual time for a fully empty day', () => {
    const { container, data } = renderStats();
    expect(data.remainingPlannedMinutes).toBe(0);
    expect(data.totalPlannedMinutes).toBe(0);
    expect(data.actual + data.dailyActual).toBe(0);
    expect(container.querySelector('[data-day-remaining]')).toHaveTextContent('0min');
    expect(container.querySelector('[data-day-total]')).toHaveTextContent('0min');
    expect(
      screen.getByText('今日实际投入（含 Daily）').nextElementSibling,
    ).toHaveTextContent('0min');
  });

  it('shows zero schedule estimates even when Daily plans contain 50 minutes', () => {
    const { data } = renderStats(createDemoDailies());
    expect(data.shown).toEqual([]);
    expect(data.remainingPlannedMinutes).toBe(0);
    expect(data.totalPlannedMinutes).toBe(0);
    expect(data.actual + data.dailyActual).toBe(0);
    expect(screen.getByText('剩余 / 当日预计（日程）')).toBeVisible();
  });

  it('keeps Daily completion and actual time out of schedule estimates', () => {
    const daily = createDemoDailies();
    daily[0].completed = true;
    daily[0].children[0].completed = true;
    daily[0].children[0].actual = 12;
    const { container, data } = renderStats(daily);
    expect(data.remainingPlannedMinutes).toBe(0);
    expect(data.totalPlannedMinutes).toBe(0);
    expect(container.querySelector('[data-day-remaining]')).toHaveTextContent('0min');
    expect(container.querySelector('[data-day-total]')).toHaveTextContent('0min');
    expect(
      screen.getByText('今日实际投入（含 Daily）').nextElementSibling,
    ).toHaveTextContent('12min');
  });

  it('uses schedule completion for the remaining fraction while retaining Daily actual time', () => {
    const daily = createDemoDailies();
    daily[0].children[0].actual = 12;
    const task: Task = {
      id: 'scheduled',
      projectId: 'work',
      title: '日程任务',
      date: '2026-11-19',
      plannedDurationMinutes: 60,
      completed: false,
      status: 'active',
      importance: 'normal',
      createdAt: '2026-11-19T00:00:00Z',
      updatedAt: '2026-11-19T00:00:00Z',
    };
    const { container } = renderStats(daily, [
      task,
      { ...task, id: 'done', completed: true, plannedDurationMinutes: 20 },
    ]);
    expect(container.querySelector('[data-day-remaining]')).toHaveTextContent(/^1h$/);
    expect(container.querySelector('[data-day-total]')).toHaveTextContent(/^1h20min$/);
    expect(screen.getByText('剩余 / 当日预计（日程）')).toBeVisible();
    expect(
      screen.getByText('今日实际投入（含 Daily）').nextElementSibling,
    ).toHaveTextContent('12min');
  });
});
