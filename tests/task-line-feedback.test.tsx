/** @fileoverview 用快慢项目切换与失败重试验证任务行布局稳定、同步防重入和提交确认后关闭。 */
import { useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TaskLine } from '@/features/tasks/components/task-line';
import type { Project, Task } from '@/types/domain';

const projects: Project[] = [
  { id: 'one', name: '项目一', color: '#123456', status: 'active', createdAt: '' },
  { id: 'two', name: '项目二', color: '#654321', status: 'active', createdAt: '' },
];
const task: Task = {
  id: 'task',
  title: '课程准备',
  projectId: 'one',
  completed: false,
  status: 'active',
  createdAt: '',
  updatedAt: '',
};

/** 请求可明确确认或拒绝，避免依赖机器速度来制造暂态。 */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** 使用正式任务行接收确认值，编辑期间仍保留原始 Task 并发基准。 */
function TaskLineHarness({
  save,
}: {
  save: (next: Task, original?: Task) => Promise<void>;
}) {
  const [current, setCurrent] = useState(task);
  return (
    <TaskLine
      task={current}
      projects={projects}
      onUpdate={async (next, original) => {
        await save(next, original);
        setCurrent(next);
      }}
      onEdit={vi.fn()}
      onMove={vi.fn()}
      onReschedule={vi.fn()}
      inSchedulePanel
    />
  );
}

afterEach(cleanup);

it.each(['immediate', 'delayed'] as const)(
  '%s project confirmation keeps the task content stable and submits only once',
  async (mode) => {
    const request = deferred();
    const save = vi.fn(() =>
      mode === 'delayed' ? request.promise : Promise.resolve(),
    );
    const { container } = render(<TaskLineHarness save={save} />);
    const row = container.querySelector('.timeline-row')!;
    const content = row.querySelector('.task-content-wrap')!;
    const originalChildren = content.childElementCount;
    fireEvent.click(screen.getByRole('button', { name: '课程准备所属项目：项目一' }));
    const target = screen.getByRole('button', { name: '【项目二】', exact: true });
    act(() => {
      target.click();
      target.click();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'two' }),
      task,
    );
    expect(content.childElementCount).toBe(originalChildren);
    expect(screen.queryByRole('status')).toBeNull();
    if (mode === 'delayed') {
      expect(row).toHaveAttribute('aria-busy', 'true');
      expect(target).toBeDisabled();
      expect(
        screen.getByRole('button', { name: '课程准备所属项目：项目一' }),
      ).toBeVisible();
      await act(async () => request.resolve());
    }
    await waitFor(() => expect(row).toHaveAttribute('aria-busy', 'false'));
    expect(
      screen.getByRole('button', { name: '课程准备所属项目：项目二' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '【项目二】', exact: true }),
    ).toBeNull();
    expect(content.childElementCount).toBe(originalChildren);
    expect(screen.queryByRole('status')).toBeNull();
  },
);

it('keeps a rejected project selection and error stable through consecutive failed retries', async () => {
  const request = deferred();
  const retry = deferred();
  const save = vi
    .fn()
    .mockReturnValueOnce(request.promise)
    .mockReturnValueOnce(retry.promise)
    .mockResolvedValue(undefined);
  const { container } = render(<TaskLineHarness save={save} />);
  const row = container.querySelector('.timeline-row')!;
  fireEvent.click(screen.getByRole('button', { name: '课程准备所属项目：项目一' }));
  const target = screen.getByRole('button', { name: '【项目二】', exact: true });
  fireEvent.click(target);
  await act(async () => request.reject(new Error('网络断开')));
  expect(row).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByRole('alert')).toHaveTextContent('网络断开');
  expect(
    screen.getByRole('button', { name: '课程准备所属项目：项目一' }),
  ).toBeVisible();
  expect(target).toBeEnabled();
  expect(screen.queryByRole('status')).toBeNull();
  const error = screen.getByRole('alert');
  fireEvent.click(target);
  expect(row).toHaveAttribute('aria-busy', 'true');
  expect(error).toHaveTextContent('网络断开');
  expect(error).toBeInTheDocument();
  expect(target).toBeDisabled();
  await act(async () => retry.reject(new Error('网络断开')));
  expect(screen.getByRole('alert')).toBe(error);
  expect(target).toBeEnabled();
  fireEvent.click(target);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: '课程准备所属项目：项目二' }),
    ).toBeVisible(),
  );
  expect(save).toHaveBeenCalledTimes(3);
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({ projectId: 'two' }),
    task,
  );
  expect(screen.queryByRole('alert')).toBeNull();
});
