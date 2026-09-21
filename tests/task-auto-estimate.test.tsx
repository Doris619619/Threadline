/** @fileoverview 验证日程新增草稿与编辑表单在修改时间时自动回填，保留手动估时及实际耗时。 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useTaskCreateDrafts } from '@/features/tasks/hooks/use-task-create-drafts';
import { estimateFromTimeRange } from '@/features/tasks/task-time';
import { TaskTimingFields } from '@/features/tasks/components/task-timing-fields';

afterEach(cleanup);
it('fills and recalculates a compact-input range, while incomplete ranges retain the estimate', () => {
  const hook = renderHook(useTaskCreateDrafts);
  act(() =>
    hook.result.current.updateTimedDraft({ startTime: '830', endTime: '1000' }),
  );
  expect(hook.result.current.timedDraft.planned).toBe('90');
  act(() => hook.result.current.updateTimedDraft({ endTime: '10:30' }));
  expect(hook.result.current.timedDraft.planned).toBe('120');
  act(() => hook.result.current.updateTimedDraft({ planned: '45' }));
  act(() => hook.result.current.updateTimedDraft({ title: '标题' }));
  expect(hook.result.current.timedDraft.planned).toBe('45');
  act(() => hook.result.current.updateTimedDraft({ endTime: '' }));
  expect(hook.result.current.timedDraft.planned).toBe('45');
});
it.each([
  ['23:30', '00:30'],
  ['08:00', '08:00'],
  ['25:00', '26:00'],
  ['', '10:00'],
])('does not infer an invalid range %s to %s', (start, end) => {
  expect(estimateFromTimeRange(start, end, '45')).toBe('45');
});
it('updates the visible editor estimate and allows a manual adjustment afterward', () => {
  render(
    <form>
      <TaskTimingFields project={null} />
    </form>,
  );
  fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '09:15' } });
  fireEvent.change(screen.getByLabelText('结束时间'), { target: { value: '10:45' } });
  expect(screen.getByLabelText('预计时长（分钟）')).toHaveValue('90');
  fireEvent.change(screen.getByLabelText('预计时长（分钟）'), {
    target: { value: '60' },
  });
  expect(screen.getByLabelText('预计时长（分钟）')).toHaveValue('60');
  fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '09:00' } });
  expect(screen.getByLabelText('预计时长（分钟）')).toHaveValue('105');
  expect(screen.getByLabelText('实际时长（分钟）')).toHaveValue(null);
});
