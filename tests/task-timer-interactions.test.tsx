/** @fileoverview 验证任务计时入口、到时续时、键盘取消及完成失败重试；续时和删除均不得写任务账本。 */
import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { TaskTimerCard } from '@/features/tasks/components/task-timer-card';
import { TaskTimerDialog } from '@/features/tasks/components/task-timer-dialog';
import { WaitingTaskRow } from '@/features/tasks/components/waiting-task-row';
import { PlanTaskRow } from '@/features/stage-plans/task-row';
import { TaskLine } from '@/features/tasks/components/task-line';
import { TaskTimerContext } from '@/features/tasks/task-timer-context';
import { setAccountTimezone } from '@/lib/account-clock';
import { extendCountdown, type TaskTimer } from '@/features/tasks/timer-rules';
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
const countdownNow = Date.parse('2026-10-03T08:00:00Z');
const expiredCountdown: TaskTimer = {
  ...timer,
  mode: 'down',
  targetMs: 10 * 60000,
  elapsedMs: 10 * 60000,
  firstStartedAt: countdownNow - 10 * 60000,
};

/** 保留真实卡片自己的展开状态，并像账号计时会话一样接收续时后重新渲染。 */
function CountdownHarness({
  now = countdownNow,
  onChange,
  onRecord,
  onRemove,
}: {
  now?: number;
  onChange: (value: TaskTimer) => void;
  onRecord: ReturnType<typeof vi.fn>;
  onRemove: () => void;
}) {
  const [value, setValue] = useState(expiredCountdown);
  return (
    <TaskTimerCard
      task={task}
      timer={value}
      now={now}
      today="2026-10-03"
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      onExtend={(minutes) => {
        const next = extendCountdown(value, minutes, Date.now());
        setValue(next);
        onChange(next);
      }}
      onRemove={onRemove}
      onRecord={onRecord}
    />
  );
}
afterEach(() => {
  cleanup();
  setAccountTimezone(undefined);
  vi.restoreAllMocks();
});

test('start footer follows the account timezone and stays fixed after resuming', () => {
  const firstStartedAt = Date.parse('2026-10-03T07:30:00Z');
  setAccountTimezone('Asia/Shanghai');
  const props = {
    task,
    timer: { ...timer, firstStartedAt },
    now: firstStartedAt,
    today: '2026-10-06',
    onChange: vi.fn(),
    onExtend: vi.fn(),
    onRemove: vi.fn(),
    onRecord: vi.fn(),
  };
  const view = render(<TaskTimerCard {...props} />);
  expect(screen.getByText('开始于 2026/10/03 15:30')).toHaveAttribute(
    'datetime',
    '2026-10-03T07:30:00.000Z',
  );
  expect(screen.getByText('开始于 2026/10/03 15:30')).toHaveAttribute(
    'title',
    '开始于 2026/10/03 15:30（中国 · 北京时间）',
  );
  view.rerender(
    <TaskTimerCard
      {...props}
      timer={{ ...props.timer, startedAt: firstStartedAt + 3600000 }}
    />,
  );
  expect(screen.getByText('开始于 2026/10/03 15:30')).toBeVisible();
  setAccountTimezone('America/New_York');
  view.rerender(<TaskTimerCard {...props} />);
  expect(screen.getByText('开始于 2026/10/03 03:30')).toBeVisible();
});

test('waiting task right click shares the tap menu and Escape restores task focus', () => {
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
  const taskMain = screen.getByRole('button', {
    name: task.title + '· 待定',
    exact: true,
  });
  taskMain.focus();
  fireEvent.contextMenu(trigger.closest('.waiting-task-row')!, {
    clientX: 100,
    clientY: 80,
  });
  const action = screen.getByRole('menuitem', { name: '加入计时' });
  fireEvent.keyDown(action, { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(taskMain).toHaveFocus();
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
      onExtend={vi.fn()}
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
        onExtend={vi.fn()}
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
  fireEvent.click(screen.getByRole('button', { name: '完成并记耗时' }));
  await waitFor(() => expect(remove).toHaveBeenCalledOnce());
  expect(record).toHaveBeenLastCalledWith(task, 1, '2026-10-03');
  expect(record).toHaveBeenCalledTimes(2);
});

test('extension emits only a minute intent without changing the timer snapshot or recording the task', () => {
  const change = vi.fn(),
    extend = vi.fn(),
    record = vi.fn(),
    remove = vi.fn();
  render(
    <TaskTimerCard
      task={task}
      timer={expiredCountdown}
      now={countdownNow}
      today="2026-10-03"
      onChange={change}
      onExtend={extend}
      onRecord={record}
      onRemove={remove}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '延长', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '10分钟', exact: true }));
  expect(extend).toHaveBeenCalledExactlyOnceWith(10);
  expect(change).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

test.each([5, 10, 15, 30])(
  'expired countdown resumes immediately for %i minutes without recording or completing the task',
  (minutes) => {
    vi.spyOn(Date, 'now').mockReturnValue(countdownNow);
    const change = vi.fn(),
      record = vi.fn(),
      remove = vi.fn();
    render(<CountdownHarness onChange={change} onRecord={record} onRemove={remove} />);
    fireEvent.click(screen.getByRole('button', { name: '延长', exact: true }));
    const panel = screen.getByRole('group', { name: '延长倒计时' });
    expect(within(panel).getByText(/已用/)).toHaveTextContent(/已用\s*10\s*分钟/);
    expect(within(panel).queryByRole('heading')).toBeNull();
    expect(within(panel).queryByText(task.title)).toBeNull();
    expect(within(panel).queryByText(/累计耗时保留|选定时间后/)).toBeNull();
    fireEvent.click(
      within(panel).getByRole('button', { name: minutes + '分钟', exact: true }),
    );
    expect(screen.getByLabelText('倒计时运行中')).toHaveTextContent(
      '00:' + String(minutes).padStart(2, '0') + ':00',
    );
    expect(screen.queryByRole('group', { name: '延长倒计时' })).toBeNull();
    expect(screen.queryByText('已到时')).toBeNull();
    expect(change).toHaveBeenCalledOnce();
    expect(record).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  },
);

test('a second extension keeps accumulated minutes and the original start date', () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(countdownNow);
  const change = vi.fn(),
    record = vi.fn(),
    remove = vi.fn();
  const props = { onChange: change, onRecord: record, onRemove: remove };
  const view = render(<CountdownHarness {...props} />);
  const footer = screen.getByText(/开始于/).textContent;
  fireEvent.click(screen.getByRole('button', { name: '延长', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '5分钟', exact: true }));
  const nextNow = countdownNow + 5 * 60000;
  clock.mockReturnValue(nextNow);
  view.rerender(<CountdownHarness {...props} now={nextNow} />);
  expect(screen.getByLabelText('倒计时已到时')).toHaveTextContent('00:00:00');
  fireEvent.click(screen.getByRole('button', { name: '延长', exact: true }));
  const panel = screen.getByRole('group', { name: '延长倒计时' });
  expect(within(panel).getByText(/已用/)).toHaveTextContent(/已用\s*15\s*分钟/);
  fireEvent.click(within(panel).getByRole('button', { name: '10分钟', exact: true }));
  expect(screen.getByLabelText('倒计时运行中')).toHaveTextContent('00:10:00');
  expect(screen.getByText(/开始于/)).toHaveTextContent(footer!);
  expect(change).toHaveBeenCalledTimes(2);
  expect(record).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

test('custom extension retains invalid input and confirms only valid integer minutes', () => {
  vi.spyOn(Date, 'now').mockReturnValue(countdownNow);
  const change = vi.fn(),
    record = vi.fn(),
    remove = vi.fn();
  render(<CountdownHarness onChange={change} onRecord={record} onRemove={remove} />);
  fireEvent.click(screen.getByRole('button', { name: '延长', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '自定义', exact: true }));
  const input = screen.getByLabelText('延长分钟');
  for (const value of ['', '0', '-1', '1.5', '1441']) {
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: '确认', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('1—1440');
    expect(input).toHaveValue(value);
  }
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: '确认', exact: true }));
  expect(screen.getByLabelText('倒计时运行中')).toHaveTextContent('00:12:00');
  expect(change).toHaveBeenCalledOnce();
  expect(record).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

test('custom cancellation and Escape leave an expired countdown unchanged', () => {
  const change = vi.fn(),
    record = vi.fn(),
    remove = vi.fn();
  render(<CountdownHarness onChange={change} onRecord={record} onRemove={remove} />);
  const extend = screen.getByRole('button', { name: '延长', exact: true });
  fireEvent.click(extend);
  fireEvent.click(screen.getByRole('button', { name: '自定义', exact: true }));
  fireEvent.change(screen.getByLabelText('延长分钟'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
  expect(screen.queryByRole('group', { name: '延长倒计时' })).toBeNull();
  fireEvent.click(extend);
  fireEvent.click(screen.getByRole('button', { name: '自定义', exact: true }));
  fireEvent.keyDown(screen.getByLabelText('延长分钟'), { key: 'Escape' });
  expect(screen.queryByRole('group', { name: '延长倒计时' })).toBeNull();
  expect(screen.getByLabelText('倒计时已到时')).toHaveTextContent('00:00:00');
  expect(change).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

test('pending completion locks extension even when it arrives after the panel opens', () => {
  const props = {
    task,
    timer: expiredCountdown,
    now: countdownNow,
    today: '2026-10-03',
    onChange: vi.fn(),
    onExtend: vi.fn(),
    onRecord: vi.fn(),
    onRemove: vi.fn(),
  };
  const view = render(<TaskTimerCard {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '延长', exact: true }));
  expect(screen.getByRole('group', { name: '延长倒计时' })).toBeVisible();
  view.rerender(
    <TaskTimerCard
      {...props}
      timer={{ ...expiredCountdown, pending: { original: task, minutes: 10 } }}
    />,
  );
  expect(screen.queryByRole('group', { name: '延长倒计时' })).toBeNull();
  expect(screen.getByRole('button', { name: '延长', exact: true })).toBeDisabled();
  expect(props.onChange).not.toHaveBeenCalled();
  expect(props.onExtend).not.toHaveBeenCalled();
  expect(props.onRecord).not.toHaveBeenCalled();
});
