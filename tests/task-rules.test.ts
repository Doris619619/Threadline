import { describe, expect, it } from 'vitest';
import { calculateDuration, isDailyComplete, isEffectiveTask } from '@/lib/task-rules';

describe('task rules', () => {
  it('keeps abandonment distinct from deletion', () => {
    expect(isEffectiveTask({ status: 'abandoned' } as never)).toBe(false);
    expect(isEffectiveTask({ status: 'trashed' } as never)).toBe(false);
  });
  it('calculates planned duration', () =>
    expect(calculateDuration('12:00', '13:30')).toBe(90));
  it('keeps daily completion separate', () =>
    expect(isDailyComplete({ completed: false } as never, true)).toBe(true));
});
