/** @fileoverview 验证 Daily 任一子项完成、父级撤销与父子耗时汇总规则。 */

import { describe, expect, it } from 'vitest';
import {
  getDailyActualMinutes,
  isDailyCompleted,
  setDailyCompleted,
  setDailyChildCompleted,
  getDailyPlannedMinutes,
} from '@/features/daily/daily-rules';
import type { Daily } from '@/features/daily/types';

const sample: Daily = {
  id: 'daily',
  title: '学习',
  completed: false,
  actual: 5,
  result: '保留结果',
  children: [
    { title: '听力', completed: false, actual: 10, plannedDurationMinutes: 20 },
    { title: '阅读', completed: false, actual: 15, plannedDurationMinutes: 30 },
  ],
};

describe('Daily domain rules', () => {
  it('counts any completed child and supports direct completion with no children', () => {
    expect(isDailyCompleted(sample)).toBe(false);
    expect(
      isDailyCompleted({
        ...sample,
        children: [{ ...sample.children[0], completed: true }],
      }),
    ).toBe(true);
    expect(isDailyCompleted({ ...sample, completed: true, children: [] })).toBe(true);
  });

  it('recomputes completion on child changes and preserves all input when undoing the parent', () => {
    const first = setDailyChildCompleted(sample, 0, true);
    const both = setDailyChildCompleted(first, 1, true);
    expect(setDailyChildCompleted(both, 0, false).completed).toBe(true);
    expect(setDailyChildCompleted(first, 0, false).completed).toBe(false);
    expect(setDailyCompleted(both, false)).toEqual(sample);
    expect(setDailyCompleted(sample, true).children).toEqual(sample.children);
    expect(getDailyPlannedMinutes(sample)).toBe(50);
  });

  it('includes every child actual value in the single Daily total', () => {
    expect(
      getDailyActualMinutes({
        actual: 20,
        children: [{ actual: 30 }, { actual: 40 }],
      }),
    ).toBe(90);
  });
});
