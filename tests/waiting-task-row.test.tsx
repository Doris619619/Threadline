/** @fileoverview 验证待安排行的菜单边界、详细编辑入口与未来日期默认值。 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaitingTaskRow } from '@/features/tasks/components/waiting-task-row';
import { addLocalDateDays, getLocalDateKey } from '@/lib/local-date';
import type { Project, Task } from '@/types/domain';

const project: Project = {
  id: 'project-1',
  name: '工作',
  color: '#4f8cff',
  status: 'active',
  createdAt: '2026-09-04',
};
const task: Task = {
  id: 'waiting-1',
  projectId: project.id,
  title: '安排研究',
  completed: false,
  status: 'waiting',
  importance: 'normal',
  createdAt: '2026-09-04',
  updatedAt: '2026-09-04',
};

describe('WaitingTaskRow', () => {
  afterEach(cleanup);
  it('keeps only scheduling and deletion in the menu while the task body opens detailed editing', () => {
    const edit = vi.fn();
    render(
      <WaitingTaskRow
        task={task}
        projects={[project]}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={edit}
        onSchedule={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '安排研究更多操作' }));
    expect(screen.getByRole('menuitem', { name: '安排到今天' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '安排到其他日期…' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '删除' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /编辑/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /【工作】安排研究.*待定/ }));
    expect(edit).toHaveBeenCalledOnce();
  });

  it('uses tomorrow as both the minimum and default for other-date scheduling', () => {
    render(
      <WaitingTaskRow
        task={task}
        projects={[project]}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onSchedule={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '安排研究更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '安排到其他日期…' }));
    const tomorrow = addLocalDateDays(getLocalDateKey(), 1);
    const input = screen.getByLabelText('安排日期') as HTMLInputElement;
    expect(input.min).toBe(tomorrow);
    expect(input.value).toBe(tomorrow);
  });
});
