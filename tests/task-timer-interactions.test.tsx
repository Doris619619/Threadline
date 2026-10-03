/** @fileoverview 验证任务菜单入口、触屏设置、键盘关闭和计时失败重试，删除计时不改任务账本。 */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { TaskTimerCard } from '@/features/tasks/components/task-timer-card';
import { TaskTimerDialog } from '@/features/tasks/components/task-timer-dialog';
import { WaitingTaskRow } from '@/features/tasks/components/waiting-task-row';
import { PlanTaskRow } from '@/features/stage-plans/task-row';
import { TaskLine } from '@/features/tasks/components/task-line';
import { TaskTimerContext } from '@/features/tasks/task-timer-context';
import type { TaskTimer } from '@/features/tasks/timer-rules';
import type { Task } from '@/types/domain';

const task: Task = {
  id: 'a',
  title: '课程准备',
  projectId: 'p',
  completed: false,
  status: 'waiting',
  importance: 'normal',
  createdAt: '2026-10-03',
  updatedAt: '2026-10-03',
};
const timer: TaskTimer = {
  id: 'timer-a',
  taskId: 'a',
  title: task.title,
  mode: 'up',
  targetMs: 60000,
  elapsedMs: 60000,
  entryDate: '2026-10-03',
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('waiting task right click shares the tap menu and Escape restores its trigger', () => {
  const request = vi.fn();
  render(
    <TaskTimerContext.Provider value={{ ready: true, taskIds: [], request }}>
      <WaitingTaskRow
        task={task}
        projects={[]}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onSchedule={vi.fn()}
      />
    </TaskTimerContext.Provider>,
  );
  const trigger = screen.getByRole('button', { name: task.title + '更多操作' });
  fireEvent.contextMenu(trigger.closest('.waiting-task-row')!, {
    clientX: 100,
    clientY: 80,
  });
  const action = screen.getByRole('menuitem', { name: '加入计时' });
  fireEvent.keyDown(action, { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('menuitem', { name: '加入计时' }));
  expect(request).toHaveBeenCalledExactlyOnceWith(task.id);
});

test.each([
  ['already present', ['a'], '已加入计时'],
  ['three slots occupied', ['b', 'c', 'd'], '最多三个计时器'],
] as const)('prevents adding a task when %s', (_, ids, label) => {
  const request = vi.fn();
  render(
    <TaskTimerContext.Provider value={{ ready: true, taskIds: [...ids], request }}>
      <PlanTaskRow
        task={task}
        today="2026-10-03"
        onEdit={vi.fn()}
        onDate={vi.fn()}
        onToday={vi.fn()}
        onToggle={vi.fn()}
      />
    </TaskTimerContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: task.title + '更多操作' }));
  expect(screen.getByRole('menuitem', { name: label })).toBeDisabled();
  expect(request).not.toHaveBeenCalled();
});

test('schedule keyboard menu exposes timing, while input right click keeps native editing', () => {
  const request = vi.fn();
  const { container } = render(
    <TaskTimerContext.Provider value={{ ready: true, taskIds: [], request }}>
      <TaskLine
        task={{ ...task, status: 'active' }}
        projects={[]}
        onUpdate={vi.fn()}
        onEdit={vi.fn()}
        onMove={vi.fn()}
        onReschedule={vi.fn()}
      />
    </TaskTimerContext.Provider>,
  );
  const more = screen.getByRole('button', { name: task.title + '更多操作' });
  fireEvent.keyDown(more, { key: 'F10', shiftKey: true });
  fireEvent.click(screen.getByRole('button', { name: '加入计时' }));
  expect(request).toHaveBeenCalledExactlyOnceWith(task.id);
  fireEvent.click(container.querySelector('.task-title')!);
  const input = screen.getByDisplayValue(task.title);
  fireEvent.contextMenu(input);
  expect(screen.queryByRole('group', { name: task.title + '操作' })).toBeNull();
});

test('countdown settings validate integer minutes and retain rejected input', () => {
  const start = vi.fn().mockReturnValue('任务已完成。');
  const close = vi.fn();
  render(<TaskTimerDialog task={task} onStart={start} onClose={close} />);
  fireEvent.change(screen.getByLabelText('计时方式'), { target: { value: 'down' } });
  const input = screen.getByLabelText('倒计时分钟');
  for (const value of ['0', '1.5', '-1', '1441']) {
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: '开始计时' }));
    expect(screen.getByRole('alert')).toHaveTextContent('1—1440');
  }
  expect(start).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '45' } });
  fireEvent.click(screen.getByRole('button', { name: '开始计时' }));
  expect(start).toHaveBeenCalledExactlyOnceWith('down', 45);
  expect(screen.getByRole('alert')).toHaveTextContent('任务已完成');
  expect(input).toHaveValue('45');
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(close).toHaveBeenCalledOnce();
});

test('timer modes remain accessible without extra text and removal never records time', () => {
  const remove = vi.fn(),
    record = vi.fn();
  const { container } = render(
    <TaskTimerCard
      task={task}
      timer={{ ...timer, mode: 'down' }}
      now={0}
      today="2026-10-03"
      onChange={vi.fn()}
      onRemove={remove}
      onRecord={record}
    />,
  );
  expect(screen.getByLabelText('倒计时已到时')).toBeVisible();
  expect(screen.queryByText('倒计时')).toBeNull();
  expect(container.querySelector('article')).toHaveAttribute(
    'title',
    '倒计时 · ' + task.title,
  );
  expect(container.querySelector('article')).toHaveAttribute('data-mode', 'down');
  expect(screen.queryByRole('button', { name: '移除' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: task.title + '计时器更多操作' }));
  fireEvent.click(screen.getByRole('menuitem', { name: '删除计时器' }));
  expect(remove).toHaveBeenCalledOnce();
  expect(record).not.toHaveBeenCalled();
});

test('failed completion keeps the original intent and blocks duplicate submission', async () => {
  const record = vi
    .fn()
    .mockRejectedValueOnce(new Error('网络失败'))
    .mockResolvedValue(undefined);
  const remove = vi.fn();
  /** 模拟真实会话收到暂停和固定保存意图后重新渲染，远端变更不能覆盖原基准。 */
  function Harness({ current }: { current: Task }) {
    const [value, setValue] = useState(timer);
    return (
      <TaskTimerCard
        task={current}
        timer={value}
        now={0}
        today="2026-10-03"
        onChange={setValue}
        onRemove={remove}
        onRecord={record}
      />
    );
  }
  const view = render(<Harness current={task} />);
  const finish = screen.getByRole('button', { name: '完成并记耗时' });
  fireEvent.click(finish);
  fireEvent.click(finish);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('网络失败'));
  expect(record).toHaveBeenCalledExactlyOnceWith(task, 1, '2026-10-03');
  view.rerender(<Harness current={{ ...task, actualDurationMinutes: 90 }} />);
  fireEvent.click(screen.getByRole('button', { name: '重试保存' }));
  await waitFor(() => expect(remove).toHaveBeenCalledOnce());
  expect(record).toHaveBeenLastCalledWith(task, 1, '2026-10-03');
  expect(record).toHaveBeenCalledTimes(2);
});
