/** @fileoverview 覆盖任务领域状态转换与既有时长、Daily 规则。 */

import { describe, expect, it } from 'vitest';
import {
  calculateDuration,
  canTransitionTask,
  isDailyComplete,
  isEffectiveTask,
} from '@/lib/task-rules';

describe('task rules', () => {
  it('keeps abandonment distinct from deletion', () => {
    expect(isEffectiveTask({ status: 'abandoned' } as never)).toBe(false);
    expect(isEffectiveTask({ status: 'trashed' } as never)).toBe(false);
  });
  it('calculates planned duration', () =>
    expect(calculateDuration('12:00', '13:30')).toBe(90));
  it('keeps daily completion separate', () =>
    expect(isDailyComplete({ completed: false } as never, true)).toBe(true));
  it('requires completed tasks to be explicitly reopened before workflow changes', () => {
    const completedTask = { completed: true, status: 'active' } as never;

    expect(canTransitionTask(completedTask, 'backlog')).toBe(false);
    expect(canTransitionTask(completedTask, 'abandoned')).toBe(false);
    expect(canTransitionTask(completedTask, 'rescheduled')).toBe(false);
    expect(canTransitionTask(completedTask, 'trashed')).toBe(true);
  });
});
