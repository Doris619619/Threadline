/** @fileoverview 覆盖 Daily 父完成独立性与父子实际耗时统一口径。 */

import { describe, expect, it } from 'vitest';
import { getDailyActualMinutes, isDailyCompleted } from '@/features/daily/daily-rules';

describe('Daily domain rules', () => {
  it('does not force parent completion from a child checkbox', () => {
    expect(isDailyCompleted({ completed: false })).toBe(false);
  });

  it('includes every child actual value in the single Daily total', () => {
    expect(
      getDailyActualMinutes({
        actual: 20,
        children: [
          { actual: 30 },
          { actual: 40 },
        ],
      }),
    ).toBe(90);
  });
});
