/** @fileoverview 验证迷你今日待安排采用执行优先面，不复制完整工作台的排程或删除菜单。 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MiniTodayPanel } from '@/features/tasks/compact-workspace';
import type { Project, Task } from '@/types/domain';

vi.mock('@/lib/desktop-window-context', () => ({
  useDesktopWindow: () => ({ setMode: vi.fn().mockResolvedValue(undefined) }),
}));

const project: Project = {
  id: 'project-1', name: '工作', color: '#4f8cff', status: 'active', createdAt: '2026-09-04',
};
const waiting: Task = {
  id: 'waiting-1', projectId: project.id, title: '整理待安排', completed: false,
  status: 'waiting', importance: 'important', createdAt: '2026-09-04', updatedAt: '2026-09-04',
};

describe('MiniTodayPanel waiting actions', () => {
  it('keeps waiting rows execution-only while preserving the atomic completion entry point', () => {
    const completeWaiting = vi.fn();
    render(
      <MiniTodayPanel
        timed={[]}
        waiting={[waiting]}
        projects={[project]}
        workstationTaskIds={[]}
        onUpdateTask={vi.fn()}
        onToggleWorkstation={vi.fn()}
        onClearWorkstation={vi.fn()}
        onReorderWorkstation={vi.fn()}
        onCreateTimedTask={vi.fn().mockResolvedValue(undefined)}
        onCreateQuickTask={vi.fn().mockResolvedValue(undefined)}
        onCompleteWaitingTask={completeWaiting}
      />,
    );

    expect(screen.getByText('重要')).toBeVisible();
    expect(screen.getByText('【工作】')).toBeVisible();
    expect(screen.queryByLabelText('整理待安排更多操作')).toBeNull();
    expect(screen.queryByText('安排到今天')).toBeNull();
    expect(screen.queryByText('删除')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: '完成整理待安排' }));
    expect(completeWaiting).toHaveBeenCalledWith(waiting.id);
  });
});
