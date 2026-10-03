/** @fileoverview 验证原地估时的空值、零值、校验、取消、失败草稿与重复提交/冲突基准。 */
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskEstimateEditor } from '@/features/stage-plans/task-estimate-editor';
import type { Task } from '@/types/domain';
const task: Task = {
  id: 't',
  title: '阅读',
  projectId: 'p',
  stagePlanId: 's',
  status: 'waiting',
  completed: false,
  createdAt: '2026-10-01',
  updatedAt: '2026-10-01',
};
afterEach(cleanup);

test.each([
  ['90', 90],
  ['', undefined],
  ['0', 0],
])('saves estimate %s with original task snapshot', async (draft, expected) => {
  const save = vi.fn().mockResolvedValue(task);
  render(
    <TaskEstimateEditor task={{ ...task, plannedDurationMinutes: 20 }} onSave={save} />,
  );
  fireEvent.click(screen.getByRole('button', { name: '编辑 阅读预计分钟' }));
  const input = screen.getByLabelText('阅读预计分钟');
  expect(input).toHaveValue('20');
  fireEvent.change(input, { target: { value: draft } });
  fireEvent.submit(input.closest('form')!);
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't', plannedDurationMinutes: 20 }),
      expected,
      undefined,
    ),
  );
  await waitFor(() => expect(screen.queryByLabelText('阅读预计分钟')).toBeNull());
});

test.each(['-1', '1.5', 'NaN', '2147483648'])(
  'retains invalid input %s and allows Escape cancellation',
  async (draft) => {
    const save = vi.fn();
    render(<TaskEstimateEditor task={task} onSave={save} />);
    fireEvent.click(screen.getByText('未估时'));
    const input = screen.getByLabelText('阅读预计分钟');
    fireEvent.change(input, { target: { value: draft } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByRole('alert');
    expect(input).toHaveValue(draft);
    expect(save).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('阅读预计分钟')).toBeNull();
  },
);

test('failure keeps draft and opening baseline even when the task refreshes', async () => {
  const save = vi.fn().mockRejectedValue(new Error('任务已在其他设备修改'));
  const { rerender } = render(<TaskEstimateEditor task={task} onSave={save} />);
  fireEvent.click(screen.getByText('未估时'));
  const input = screen.getByLabelText('阅读预计分钟');
  fireEvent.change(input, { target: { value: '65' } });
  rerender(
    <TaskEstimateEditor task={{ ...task, plannedDurationMinutes: 99 }} onSave={save} />,
  );
  fireEvent.submit(input.closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('其他设备');
  expect(input).toHaveValue('65');
  expect(save).toHaveBeenCalledWith(task, 65, undefined);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('1h39min')).toHaveFocus();
});

test('pending submission locks repeated Enter and cancellation', async () => {
  let resolve!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render(<TaskEstimateEditor task={task} onSave={save} />);
  fireEvent.click(screen.getByText('未估时'));
  const input = screen.getByLabelText('阅读预计分钟');
  fireEvent.change(input, { target: { value: '15' } });
  fireEvent.submit(input.closest('form')!);
  fireEvent.submit(input.closest('form')!);
  expect(save).toHaveBeenCalledTimes(1);
  expect(input).toBeDisabled();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toBeInTheDocument();
  resolve();
  await waitFor(() => expect(screen.queryByLabelText('阅读预计分钟')).toBeNull());
});

test('actual displays the day value while editing cumulative minutes and explicit entry date', async () => {
  const save = vi.fn().mockResolvedValue(task);
  render(
    <TaskEstimateEditor
      task={{ ...task, actualDurationMinutes: 90 }}
      metric="actual"
      entryDate="2026-10-04"
      today="2026-10-04"
      displayLabel="未记录"
      onSave={save}
    />,
  );
  fireEvent.click(screen.getByText('未记录'));
  const input = screen.getByLabelText('阅读累计实际分钟');
  expect(input).toHaveValue('90');
  fireEvent.change(input, { target: { value: '100' } });
  fireEvent.submit(input.closest('form')!);
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ actualDurationMinutes: 90 }),
      100,
      '2026-10-04',
    ),
  );
});
