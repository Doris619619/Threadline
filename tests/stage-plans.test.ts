/** @fileoverview 验证阶段日期边界、唯一任务身份、普通待安排隔离和永久回顾分组。 */
import { describe, expect, it } from 'vitest';
import type { StagePlan, Task } from '@/types/domain';
import { withoutExpiredTasks } from '@/features/workspace/workspace-seed';
import {
  isGeneralWaitingTask,
  stageStatus,
  stageTaskGroups,
  stageTaskDateLabel,
  stageTimingLabel,
  validateStageDraft,
  visibleHomeStages,
} from '@/features/stage-plans/rules';
const plan: StagePlan = {
  id: 'holiday',
  name: '国庆假期',
  startDate: '2026-10-01',
  endDate: '2026-10-08',
  homeVisible: true,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
/** 用稳定身份构建原 Task，不引入第二套阶段任务模型。 */
function task(id: string, changes: Partial<Task> = {}): Task {
  return {
    id,
    projectId: 'other',
    stagePlanId: plan.id,
    title: id,
    status: 'waiting',
    completed: false,
    importance: 'normal',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    ...changes,
  };
}
describe('stage plans', () => {
  it('also keeps local preview stage history beyond the ordinary trash retention period', () => {
    const stage = task('stage-history', { status: 'trashed', deletedAt: '2020-01-01' });
    const ordinary = task('ordinary-history', {
      status: 'trashed',
      stagePlanId: undefined,
      deletedAt: '2020-01-01',
    });
    expect(withoutExpiredTasks([stage, ordinary])).toEqual([stage]);
  });
  it('includes the end date and only leaves home the next account day', () => {
    expect(stageStatus(plan, '2026-09-30')).toBe('upcoming');
    expect(stageStatus(plan, '2026-10-08')).toBe('active');
    expect(stageTimingLabel(plan, '2026-10-08')).toBe('今天结束');
    expect(visibleHomeStages([plan], '2026-10-09')).toEqual([]);
    expect(plan.homeVisible).toBe(true);
    expect(
      visibleHomeStages([{ ...plan, endDate: '2026-10-10' }], '2026-10-09'),
    ).toHaveLength(1);
  });
  it('shows every pinned upcoming/current stage and respects hidden/deleted plans', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...plan, id: String(i) }));
    expect(visibleHomeStages(many, '2026-09-29')).toHaveLength(12);
    expect(stageTimingLabel(plan, '2026-09-29')).toBe('2 天后开始');
    expect(
      visibleHomeStages(
        [
          { ...plan, homeVisible: false },
          { ...plan, deletedAt: '2026-10-01' },
        ],
        '2026-10-01',
      ),
    ).toEqual([]);
  });
  it('keeps the same task in a stage after scheduling/completing and never truncates', () => {
    const rows = Array.from({ length: 16 }, (_, i) => task(String(i)));
    expect(stageTaskGroups(rows, plan.id).waiting).toHaveLength(16);
    rows[0] = { ...rows[0], status: 'active', date: '2026-10-01' };
    rows[1] = { ...rows[1], status: 'active', date: '2026-10-03', completed: true };
    const groups = stageTaskGroups(rows, plan.id);
    expect(groups.waiting).toHaveLength(14);
    expect(groups.scheduled[0]).toBe(rows[0]);
    expect(groups.completed[0]).toBe(rows[1]);
    expect(groups.total).toBe(16);
    expect(rows).toHaveLength(16);
  });
  it('keeps stage waiting separate until explicit detach and returns scheduled tasks to their stage', () => {
    expect(isGeneralWaitingTask(task('stage'))).toBe(false);
    expect(isGeneralWaitingTask(task('ordinary', { stagePlanId: undefined }))).toBe(
      true,
    );
    expect(
      isGeneralWaitingTask(task('done', { stagePlanId: undefined, completed: true })),
    ).toBe(false);
  });
  it('retains abandoned and trashed items for review without inflating live progress', () => {
    const groups = stageTaskGroups(
      [
        task('live'),
        task('trash', { status: 'trashed' }),
        task('abandoned', { status: 'abandoned' }),
      ],
      plan.id,
    );
    expect(groups.total).toBe(1);
    expect(groups.history).toHaveLength(2);
  });
  it('uses calendar dates across DST and formats date labels across years', () => {
    expect(
      stageTimingLabel(
        { ...plan, startDate: '2026-11-01', endDate: '2026-11-04' },
        '2026-11-01',
      ),
    ).toBe('还有 3 天');
    expect(stageTaskDateLabel('2026-10-01', '2026-10-01')).toBe('今天');
    expect(stageTaskDateLabel('2026-10-02', '2026-10-01')).toBe('明天');
    expect(stageTaskDateLabel('2027-01-02', '2026-12-31')).toBe('2027年1月2日');
    expect(validateStageDraft({ ...plan, startDate: '2026-02-30' })).toContain('有效');
    expect(validateStageDraft({ ...plan, endDate: '2026-09-30' })).toContain(
      '不能早于',
    );
  });
});
