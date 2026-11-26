/** @fileoverview 验证工作站、日历和荧光笔颜色菜单复用共享键盘，且不改变任务与绘制模式语义。 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkstationRow } from '@/features/tasks/components/workstation-row';
import { PlanningTaskRow } from '@/features/calendar/planning-task-row';
import {
  AnnotationColorPicker,
  HIGHLIGHT_COLOR_PRESETS,
} from '@/components/annotation-color-picker';
import type { Task } from '@/types/domain';

afterEach(cleanup);

const task: Task = {
  id: 'task',
  projectId: 'project',
  title: '课程准备',
  date: '2026-11-19',
  completed: false,
  status: 'active',
  importance: 'normal',
  createdAt: '',
  updatedAt: '',
};

/** 工作站恢复无常显按钮的紧凑行；右键与键盘仍可移出引用，取消菜单归焦原行且不修改任务。 */
it('keeps workstation rows compact while retaining context and keyboard removal menus', () => {
  const remove = vi.fn();
  const originalTask = { ...task };
  render(
    <ul>
      <WorkstationRow
        task={task}
        index={0}
        label={task.title}
        onRemove={remove}
        onReorder={vi.fn()}
      />
    </ul>,
  );
  const row = screen.getByRole('listitem', { name: /1 课程准备/ });
  expect(within(row).queryByRole('button')).toBeNull();
  row.focus();
  fireEvent.contextMenu(row, { clientX: 190, clientY: 160 });
  const item = screen.getByRole('menuitem', { name: '移出工作站' });
  expect(item).toHaveFocus();
  fireEvent.keyDown(item, { key: 'Escape' });
  expect(row).toHaveFocus();
  expect(remove).not.toHaveBeenCalled();
  fireEvent.keyDown(row, { key: 'F10', shiftKey: true });
  const keyboardItem = screen.getByRole('menuitem', { name: '移出工作站' });
  expect(keyboardItem).toHaveFocus();
  fireEvent.keyDown(keyboardItem, { key: 'Escape' });
  expect(row).toHaveFocus();
  expect(remove).not.toHaveBeenCalled();
  fireEvent.keyDown(row, { key: 'ContextMenu' });
  fireEvent.click(screen.getByRole('menuitem', { name: '移出工作站' }));
  expect(remove).toHaveBeenCalledExactlyOnceWith(task.id);
  expect(task).toEqual(originalTask);
});

it('keeps calendar menus inside their modal owner, restores focus and invokes the original transition', () => {
  const waiting = vi.fn();
  render(
    <dialog open aria-label="安排详情">
      <PlanningTaskRow
        task={task}
        projects={[]}
        disabled={false}
        targetDate="2026-11-19"
        onEdit={vi.fn()}
        onComplete={vi.fn()}
        onReschedule={vi.fn()}
        onWaiting={waiting}
        onSchedule={vi.fn()}
      />
    </dialog>,
  );
  const dialog = screen.getByRole('dialog', { name: '安排详情' });
  const trigger = within(dialog).getByRole('button', { name: '课程准备更多操作' });
  trigger.focus();
  fireEvent.click(trigger);
  const menu = within(dialog).getByRole('menu', { name: '课程准备日历操作' });
  expect(menu).toBeVisible();
  fireEvent.keyDown(within(menu).getByRole('menuitem', { name: '调整日期…' }), {
    key: 'Escape',
  });
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.click(within(dialog).getByRole('menuitem', { name: '移到待安排' }));
  expect(waiting).toHaveBeenCalledOnce();
  expect(screen.queryByRole('menu')).toBeNull();
});

it('uses mutually exclusive colors and consumes Escape before the drawing-mode shortcut', () => {
  const change = vi.fn();
  const activate = vi.fn();
  const modeShortcut = vi.fn();
  window.addEventListener('keydown', modeShortcut);
  try {
    render(
      <AnnotationColorPicker
        active
        color={HIGHLIGHT_COLOR_PRESETS[0].value}
        onActivate={activate}
        onColorChange={change}
      />,
    );
    const trigger = screen.getByRole('button', { name: '选择颜色，当前黄色' });
    expect(screen.getByRole('button', { name: '荧光笔' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(trigger).not.toHaveAttribute('aria-pressed');
    trigger.focus();
    fireEvent.click(trigger);
    const selected = screen.getByRole('menuitemradio', { name: '黄色', exact: true });
    expect(selected).toHaveFocus();
    expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(selected).toHaveClass('annotation-color-option', 'is-selected');
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(5);
    fireEvent.keyDown(selected, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(modeShortcut).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: '蓝色', exact: true }));
    expect(change).toHaveBeenCalledExactlyOnceWith(HIGHLIGHT_COLOR_PRESETS[2].value);
    expect(activate).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
  } finally {
    window.removeEventListener('keydown', modeShortcut);
  }
});
