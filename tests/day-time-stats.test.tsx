/** @fileoverview 验证首页空数据为零，以及 Daily 预计与实际投入的可见统计范围。 */

import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DayTimeStats } from '@/features/tasks/components/day-time-stats';
import { useTaskDashboardData } from '@/features/tasks/hooks/use-task-dashboard-data';
import { createDemoDailies } from '@/features/workspace/demo-seed';
import type { Daily } from '@/features/daily/types';

afterEach(cleanup);

/** 用真实首页派生数据渲染统计栏；日程为空，Daily 快照由调用者显式传入。 */
function renderStats(daily: Daily[] = []) {
  const { result } = renderHook(() =>
    useTaskDashboardData({
      tasks: [],
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

  it('identifies Daily estimates visibly when an empty schedule still totals 50 minutes', () => {
    const { data } = renderStats(createDemoDailies());
    expect(data.shown).toEqual([]);
    expect(data.remainingPlannedMinutes).toBe(50);
    expect(data.totalPlannedMinutes).toBe(50);
    expect(data.actual + data.dailyActual).toBe(0);
    expect(screen.getByText('剩余 / 当日预计（含 Daily）')).toBeVisible();
  });

  it('keeps estimates separate from saved Daily time and derives remaining from completion', () => {
    const daily = createDemoDailies();
    daily[0].completed = true;
    daily[0].children[0].completed = true;
    daily[0].children[0].actual = 12;
    const { container, data } = renderStats(daily);
    expect(data.remainingPlannedMinutes).toBe(20);
    expect(data.totalPlannedMinutes).toBe(50);
    expect(container.querySelector('[data-day-remaining]')).toHaveTextContent('20min');
    expect(container.querySelector('[data-day-total]')).toHaveTextContent('50min');
    expect(
      screen.getByText('今日实际投入（含 Daily）').nextElementSibling,
    ).toHaveTextContent('12min');
  });
});
