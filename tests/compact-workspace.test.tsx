/** @fileoverview 验证便签今日只呈现传入日程，完成与详情操作仍交给业务层。 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniTodayPanel, WorkstationPanel } from '@/features/tasks/compact-workspace';
import { PlannedMinutesField } from '@/features/tasks/components/planned-minutes-field';
import type { Project, Task } from '@/types/domain';
vi.mock('@/lib/desktop-window-context', () => ({
  useDesktopWindow: () => ({ setMode: vi.fn() }),
}));
afterEach(cleanup);
const project: Project = {
  id: 'p',
  name: '课程',
  color: '#4f8cff',
  status: 'active',
  createdAt: '',
};
const task: Task = {
  id: 't',
  projectId: 'p',
  title: '准备ECE2050面试',
  date: '2026-09-09',
  completed: false,
  status: 'active',
  createdAt: '',
  updatedAt: '',
  plannedStartTime: '19:00',
  plannedEndTime: '19:30',
};
describe('compact note behavior', () => {
  it('shows schedule with adjacent completion and opens details or creation through the parent', () => {
    const update = vi.fn(),
      open = vi.fn();
    render(
      <MiniTodayPanel
        timed={[task]}
        projects={[project]}
        onUpdateTask={update}
        onOpenTask={open}
      />,
    );
    expect(screen.queryByText('待安排')).toBeNull();
    expect(screen.queryByText('待定')).toBeNull();
    expect(screen.getByText('19:00–19:30')).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: `完成${task.title}` }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't', completed: true }),
    );
    fireEvent.click(screen.getByRole('button', { name: `查看任务${task.title}` }));
    expect(open).toHaveBeenCalledWith(task);
    fireEvent.click(screen.getByRole('button', { name: '添加今日日程' }));
    expect(open).toHaveBeenLastCalledWith();
  });
  it('removes workstation references without completing or deleting the task', () => {
    const remove = vi.fn();
    render(
      <WorkstationPanel
        tasks={[task]}
        projects={[project]}
        workstationTaskIds={['t']}
        onToggleWorkstation={remove}
        onReorderWorkstation={vi.fn()}
      />,
    );
    expect(screen.getByText('1')).toBeVisible();
    const row = screen.getByText(task.title).closest('li')!;
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.contextMenu(row, { clientX: 190, clientY: 160 });
    fireEvent.keyDown(screen.getByRole('menuitem'), { key: 'Escape' });
    expect(remove).not.toHaveBeenCalled();
    fireEvent.keyDown(row, { key: 'F10', shiftKey: true });
    fireEvent.click(screen.getByRole('menuitem', { name: '移出工作站' }));
    expect(remove).toHaveBeenCalledWith('t');
    expect(task.completed).toBe(false);
  });
  it('clears estimates through the input without an extra pending button or preview', () => {
    const change = vi.fn();
    render(<PlannedMinutesField defaultValue={90} onChange={change} />);
    const input = screen.getByRole('textbox', { name: '预计时长（分钟）' });
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.change(input, { target: { value: '' } });
    expect(change).toHaveBeenLastCalledWith('');
    expect(input).toHaveAttribute('placeholder', '待定');
  });
});
