/** @fileoverview 验证单条创建和智能导入共享的任务构造边界，包含空值、稳定编号与可用项目限制。 */

import { describe, expect, it } from 'vitest';
import { buildTimedTask } from '@/features/tasks/task-create';
import type { TimedTaskDraft } from '@/features/tasks/task-drafts';
import type { Project } from '@/types/domain';

const fallback: Project = {
  id: 'fallback',
  name: '其他',
  color: '#8793a7',
  status: 'active',
  isFallback: true,
  createdAt: '2026-11-19',
};
const draft: TimedTaskDraft = {
  title: '  完成作业  ',
  projectId: fallback.id,
  startTime: '',
  endTime: '',
  planned: '',
  actual: '',
  completed: false,
};

describe('buildTimedTask', () => {
  it('keeps optional fields empty and uses the selected day and stable identity', () => {
    const task = buildTimedTask(draft, [fallback], '2026-11-21', 'stable-id');
    expect(task).toMatchObject({
      id: 'stable-id',
      title: '完成作业',
      projectId: fallback.id,
      date: '2026-11-21',
      schedulePendingTime: true,
      plannedStartTime: undefined,
      plannedEndTime: undefined,
      plannedDurationMinutes: undefined,
      actualDurationMinutes: undefined,
      completed: false,
      completedAt: undefined,
      status: 'active',
      importance: 'normal',
    });
    expect(task.createdAt).toBe(task.updatedAt);
  });

  it('normalizes existing time and duration formats without inferring a blank estimate', () => {
    const task = buildTimedTask(
      { ...draft, startTime: '830', endTime: '10:00', actual: '1h20min' },
      [fallback],
      '2026-11-19',
    );
    expect(task).toMatchObject({
      plannedStartTime: '08:30',
      plannedEndTime: '10:00',
      plannedDurationMinutes: undefined,
      actualDurationMinutes: 80,
      schedulePendingTime: false,
    });
  });

  it('retains an explicit estimate independently of the schedule and preserves single-create completion', () => {
    const task = buildTimedTask(
      { ...draft, startTime: '830', endTime: '1000', planned: '45', completed: true },
      [fallback],
      '2026-11-19',
    );
    expect(task.plannedDurationMinutes).toBe(45);
    expect(task.completedAt).toBe(task.createdAt);
  });

  it.each([
    [{ title: '' }, '请输入任务名称'],
    [{ title: '长'.repeat(201) }, '任务名称不能超过 200 个字符'],
    [{ projectId: '' }, '请选择项目'],
    [{ projectId: 'unknown' }, '请先创建一个可用项目'],
    [{ startTime: '9:0' }, '开始时间格式应为 08:30'],
    [{ endTime: '1000' }, '结束时间需晚于有效的开始时间'],
    [{ startTime: '1000', endTime: '0900' }, '结束时间需晚于有效的开始时间'],
    [{ startTime: '1000', endTime: '1000' }, '结束时间需晚于有效的开始时间'],
    [{ startTime: '2300', endTime: '0100' }, '结束时间需晚于有效的开始时间'],
    [{ planned: '-1' }, '预计请输入非负整数分钟'],
    [{ planned: '1h' }, '预计请输入非负整数分钟'],
    [{ actual: '-1' }, '实际耗时请输入有效的非负分钟'],
  ] as const)('rejects invalid draft %j', (patch, message) => {
    expect(() =>
      buildTimedTask({ ...draft, ...patch }, [fallback], '2026-11-19'),
    ).toThrow(message);
  });

  it.each([
    { ...fallback, status: 'archived' as const },
    { ...fallback, deletedAt: '2026-11-19T10:00:00Z' },
  ])('rejects an unavailable project instead of choosing another one', (project) => {
    expect(() => buildTimedTask(draft, [project], '2026-11-19')).toThrow(
      '请先创建一个可用项目',
    );
  });
});
