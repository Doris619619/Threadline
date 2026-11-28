/** @fileoverview 验证操作菜单、首页互斥选择及项目选择的键盘、保存屏障与焦点行为。 */
import { useRef, useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  HomeSideMenu,
  type HomeSideView,
} from '@/features/tasks/components/home-side-menu';
import { TaskRowActions } from '@/features/tasks/components/task-row-actions';
import { TaskActionsPopover } from '@/features/tasks/components/task-actions-popover';
import { ProjectPicker } from '@/components/ui/project-picker';
import { TaskTimerContext } from '@/features/tasks/task-timer-context';
import type { Project } from '@/types/domain';

afterEach(cleanup);

/** 提供真实首页受控值，外部命令确认之前不更换当前显示内容。 */
function HomeMenuHarness({ save }: { save: (value: HomeSideView) => Promise<void> }) {
  const [value, setValue] = useState<HomeSideView>('tasks');
  return (
    <HomeSideMenu
      value={value}
      onChange={async (next) => {
        await save(next);
        setValue(next);
      }}
    />
  );
}

it('selects the current radio item on open and waits for the Daily save barrier exactly once', async () => {
  let resolve!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((yes) => {
        resolve = yes;
      }),
  );
  render(<HomeMenuHarness save={save} />);
  const trigger = screen.getByRole('button', { name: '右栏显示内容：任务列表' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const current = screen.getByRole('menuitemradio', { name: '任务列表' });
  const next = screen.getByRole('menuitemradio', { name: '今日时间分布' });
  expect(current).toHaveAttribute('aria-checked', 'true');
  expect(current).toHaveFocus();
  fireEvent.keyDown(current, { key: 'ArrowDown' });
  expect(next).toHaveFocus();
  fireEvent.click(next);
  fireEvent.click(next);
  expect(save).toHaveBeenCalledExactlyOnceWith('time');
  expect(trigger).toHaveAttribute('aria-busy', 'true');
  expect(current).toHaveAttribute('aria-checked', 'true');
  expect(next).toBeDisabled();
  await act(async () => resolve());
  expect(screen.queryByRole('menu')).toBeNull();
  expect(trigger).toHaveTextContent('今日时间分布');
  expect(trigger).toHaveFocus();
});

it('closes the selected value without writing, and supports Escape and Tab focus return', () => {
  const save = vi.fn(async () => {});
  render(<HomeMenuHarness save={save} />);
  const trigger = screen.getByRole('button', { name: '右栏显示内容：任务列表' });
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('menuitemradio', { name: '任务列表' }));
  expect(save).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
  for (const key of ['Escape', 'Tab']) {
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menuitemradio', { name: '任务列表' }), { key });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  }
});

it('groups destructive task actions and navigates around disabled items with menu semantics', () => {
  const move = vi.fn();
  render(
    <TaskTimerContext.Provider
      value={{ ready: true, taskIds: ['a'], request: vi.fn() }}
    >
      <TaskRowActions
        taskId="a"
        title="课程准备"
        canChangeWorkflow
        canDrag
        editingLocked={false}
        inWorkstation={false}
        onEdit={vi.fn()}
        onMove={move}
        onReschedule={vi.fn()}
      />
    </TaskTimerContext.Provider>,
  );
  const trigger = screen.getByRole('button', { name: '课程准备更多操作' });
  trigger.focus();
  fireEvent.click(trigger);
  const menu = screen.getByRole('menu', { name: '课程准备操作' });
  expect(within(menu).getByRole('menuitem', { name: '已加入计时' })).toBeDisabled();
  const edit = within(menu).getByRole('menuitem', { name: '编辑任务…' });
  expect(edit).toHaveFocus();
  fireEvent.keyDown(edit, { key: 'End' });
  const remove = within(menu).getByRole('menuitem', { name: '删除任务' });
  expect(remove).toHaveFocus();
  expect(remove).toHaveClass('is-danger');
  expect(within(menu).getByRole('separator').nextElementSibling).toHaveTextContent(
    '放弃任务',
  );
  fireEvent.keyDown(remove, { key: 'Home' });
  expect(edit).toHaveFocus();
  fireEvent.keyDown(edit, { key: 'ArrowUp' });
  expect(remove).toHaveFocus();
  fireEvent.keyDown(remove, { key: 'Escape' });
  expect(trigger).toHaveFocus();
  expect(move).not.toHaveBeenCalled();
});

/** 表单型浮层继续允许内部 Tab，不套用操作菜单的退出逻辑。 */
function FormPopoverHarness() {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={anchor} onClick={() => setOpen(true)}>
        打开表单
      </button>
      {open && (
        <TaskActionsPopover anchor={anchor} label="表单" onClose={() => setOpen(false)}>
          <input aria-label="名称" />
          <button>保存</button>
        </TaskActionsPopover>
      )}
    </>
  );
}

it('preserves group popover form navigation instead of dismissing it on Tab', () => {
  render(<FormPopoverHarness />);
  fireEvent.click(screen.getByRole('button', { name: '打开表单' }));
  fireEvent.keyDown(screen.getByRole('textbox', { name: '名称' }), { key: 'Tab' });
  expect(screen.getByRole('group', { name: '表单' })).toBeVisible();
});

const projects: Project[] = Array.from({ length: 8 }, (_, index) => ({
  id: 'project-' + index,
  name: '项目 ' + index,
  color: '#4466aa',
  status: 'active',
  createdAt: '2026-11-19',
}));

it('selects a project with Space and restores focus without submitting a form', () => {
  const change = vi.fn();
  render(
    <ProjectPicker
      projects={projects.slice(0, 2)}
      value="project-0"
      onChange={change}
      label="选择项目"
    />,
  );
  const trigger = screen.getByRole('combobox', { name: '选择项目' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const list = screen.getByRole('listbox');
  expect(list).toHaveFocus();
  fireEvent.keyDown(list, { key: 'ArrowDown' });
  fireEvent.keyDown(list, { key: ' ' });
  expect(change).toHaveBeenCalledExactlyOnceWith('project-1');
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

it('keeps project search composition and Escape intact', () => {
  const change = vi.fn();
  render(
    <ProjectPicker
      projects={projects}
      value="project-0"
      onChange={change}
      label="选择项目"
    />,
  );
  const trigger = screen.getByRole('combobox', { name: '选择项目' });
  fireEvent.click(trigger);
  const search = screen.getByRole('combobox', { name: '搜索项目' });
  expect(search).toHaveFocus();
  fireEvent.change(search, { target: { value: '项目 7' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.keyDown(search, { key: 'Enter', isComposing: true });
  expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
