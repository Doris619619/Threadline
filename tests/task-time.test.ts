/** @fileoverview 冻结任务时间输入与展示函数的现有行为，防止结构重构改变业务语义。 */

import { describe, expect, it } from 'vitest';
import {
  formatMinutes,
  normalizeTime,
  parseDurationInput,
  parseTimeInput,
} from '@/features/tasks/task-time';

describe('task time compatibility', () => {
  it('keeps compact duration displays unchanged', () => {
    expect(formatMinutes()).toBe('—');
    expect(formatMinutes(30)).toBe('30min');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(80)).toBe('1h20min');
  });

  it('keeps supported duration inputs unchanged', () => {
    expect(parseDurationInput('30')).toBe(30);
    expect(parseDurationInput('30min')).toBe(30);
    expect(parseDurationInput('1.5h')).toBe(90);
    expect(parseDurationInput('1h20min')).toBe(80);
    expect(parseDurationInput('1.5h30m')).toBeUndefined();
    expect(parseDurationInput('1h1.5m')).toBeUndefined();
    expect(parseDurationInput('—')).toBeUndefined();
    expect(parseDurationInput('later')).toBeUndefined();
  });

  it('normalizes existing time input forms without accepting invalid values', () => {
    expect(normalizeTime('830')).toBe('08:30');
    expect(normalizeTime('8:30')).toBe('08:30');
    expect(normalizeTime('24:00')).toBeUndefined();
  });

  it('does not calculate a duration for a cross-midnight range', () => {
    expect(parseTimeInput('08:30-10:00')).toEqual({
      start: '08:30',
      end: '10:00',
      duration: 90,
    });
    expect(parseTimeInput('23:30-00:30')).toEqual({
      start: '23:30',
      end: '00:30',
    });
  });
});
