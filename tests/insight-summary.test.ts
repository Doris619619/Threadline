/** @fileoverview 验证洞察只统计所选日期的普通任务，缺失预计与未配对实际不能产生虚假偏差。 */
import { expect, it } from 'vitest';
import { buildInsightSummary } from '@/features/insights/insight-summary';
import type { Task } from '@/types/domain';

it('counts active in-range tasks and compares only paired estimates and actual ledger entries', () => {
  const base: Task = {
    id: 'a',
    projectId: 'p',
    title: '任务',
    date: '2026-09-05',
    plannedDurationMinutes: 90,
    actualDurationMinutes: 999,
    completed: true,
    status: 'active',
    importance: 'normal',
    createdAt: '',
    updatedAt: '',
  };
  const result = buildInsightSummary({
    projects: [],
    dailyByDate: {},
    dailyHistory: [],
    closeRecords: [],
    range: { start: '2026-09-01', end: '2026-09-05' },
    tasks: [
      base,
      { ...base, id: 'b', completed: false, plannedDurationMinutes: undefined },
      { ...base, id: 'c', status: 'waiting' },
      { ...base, id: 'd', status: 'abandoned' },
      { ...base, id: 'e', status: 'trashed' },
      { ...base, id: 'f', date: '2026-08-31' },
    ],
    taskTimeEntries: [
      { id: 'entry', taskId: 'a', projectId: 'p', date: '2026-09-05', minutes: 30 },
      { id: 'outside', taskId: 'a', projectId: 'p', date: '2026-08-01', minutes: 300 },
    ],
  });
  expect(result).toEqual({
    total: 2,
    completed: 1,
    pairedCount: 1,
    planned: 90,
    actual: 30,
  });
});
