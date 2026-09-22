/** @fileoverview Issue 49 的 Daily 远端基准、非法耗时、输入法和删除确认回归。 */
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { useDailyExecution } from '@/features/daily/use-daily-execution';
import { useTaskWorkflow } from '@/features/tasks/hooks/use-task-workflow';
import { TaskLine } from '@/features/tasks/components/task-line';
import type { Task } from '@/types/domain';

const task: Task = {
  id: 'task',
  title: '任务',
  projectId: 'p',
  date: '2026-09-21',
  status: 'active',
  importance: 'normal',
  completed: false,
  actualDurationMinutes: 30,
  createdAt: '2026-09-21T00:00:00Z',
  updatedAt: '2026-09-21T00:00:00Z',
};
afterEach(cleanup);

it('N03 saves a value equal to the initial value after accepting a remote update', async () => {
  const original = {
    id: 'd',
    entryId: 'e',
    title: 'Daily',
    actual: 10,
    completed: false,
    result: '',
    children: [],
  };
  const onSave = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(
    ({ daily }) => useDailyExecution(daily, '2026-09-21', onSave),
    { initialProps: { daily: original } },
  );
  hook.rerender({ daily: { ...original, actual: 20 } });
  act(() => hook.result.current.edit((value) => ({ ...value, actual: '10' })));
  await act(() => hook.result.current.flush());
  expect(onSave).toHaveBeenCalledWith(original, '2026-09-21');
});

it('N04 does not destroy annotations or memberships when trash fails', async () => {
  const annotations = vi.fn();
  const memberships = vi.fn();
  const hook = renderHook(() =>
    useTaskWorkflow({
      tasks: [task],
      selectedDate: task.date!,
      updateTasks: vi.fn(),
      updateAnnotationStrokes: annotations,
      updateWorkstationTaskIds: memberships,
      transitionTask: vi.fn().mockRejectedValue(new Error('failed')),
    }),
  );
  await act(async () => hook.result.current.moveTask(task.id, 'trashed'));
  expect(annotations).not.toHaveBeenCalled();
  expect(memberships).not.toHaveBeenCalled();
});

it('N05 keeps invalid actual minutes editable and never writes a clear', () => {
  const onUpdate = vi.fn();
  render(
    <TaskLine
      task={task}
      projects={[]}
      inSchedulePanel
      onUpdate={onUpdate}
      onEdit={() => {}}
      onMove={() => {}}
      onReschedule={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '任务实际耗时' }));
  const input = screen.getByPlaceholderText('30min');
  fireEvent.change(input, { target: { value: 'abc' } });
  fireEvent.blur(input);
  expect(onUpdate).not.toHaveBeenCalled();
  expect(input).toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeVisible();
});

it('N06 does not submit a title during IME composition', () => {
  const onUpdate = vi.fn();
  const view = render(
    <TaskLine
      task={task}
      projects={[]}
      onUpdate={onUpdate}
      onEdit={() => {}}
      onMove={() => {}}
      onReschedule={() => {}}
    />,
  );
  fireEvent.click(screen.getByText('任务'));
  const input = view.container.querySelector('input.task-title-input')!;
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'zhong' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
  expect(onUpdate).not.toHaveBeenCalled();
  expect(input).toBeInTheDocument();
  fireEvent.compositionEnd(input);
  fireEvent.change(input, { target: { value: '中文' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onUpdate).toHaveBeenCalledOnce();
  expect(onUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ title: '中文' }),
    task,
  );
});
