/** @fileoverview 验证习惯趋势在未读和空记录之间保留同一标题、图表尺寸与详情结构。 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HabitTimeTrend } from '@/features/habits/habit-trends';
import { emptyHabitData } from '@/features/habits/habit-local-repository';

afterEach(cleanup);

it('keeps a fixed chart container and honest placeholders while the requested range is unread', () => {
  const data = emptyHabitData('UTC');
  const props = {
    kind: 'wake' as const,
    entries: data.entries,
    rules: data.rules,
    start: '2026-10-05',
    end: '2026-10-10',
    average: null,
    count: 0,
    onSelect: vi.fn(),
  };
  const view = render(<HabitTimeTrend {...props} />);
  const chart = screen.getByTestId('wake-trend');
  const title = screen.getByRole('heading', { name: '起床时间' });
  const details = screen.getByText('查看每日数值');
  expect(chart).toHaveStyle({ height: '210px' });
  view.rerender(<HabitTimeTrend {...props} ready={false} average={480} count={8} />);
  expect(screen.getByTestId('wake-trend')).toBe(chart);
  expect(chart).toHaveStyle({ height: '210px' });
  expect(screen.getByRole('heading', { name: '起床时间' })).toBe(title);
  expect(screen.getByText('查看每日数值')).toBe(details);
  expect(screen.getByText('范围尚未读取')).toBeVisible();
  expect(screen.queryByText('8 次记录')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
  view.rerender(<HabitTimeTrend {...props} />);
  expect(screen.getByTestId('wake-trend')).toBe(chart);
  expect(screen.getByText('0 次记录')).toBeVisible();
  expect(screen.getAllByRole('button')).toHaveLength(6);
});
