/** @fileoverview 冻结新增行空标题取消时关闭行但不丢失草稿的既有行为。 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuickTaskCreateRow } from '@/features/tasks/components/quick-task-create-row';
import { TimedTaskCreateRow } from '@/features/tasks/components/timed-task-create-row';
import type { Project } from '@/types/domain';

const projects: Project[] = [{ id: 'work', name: '工作', color: '#4f8cff', status: 'active', createdAt: '' }];

describe('task create row compatibility', () => {
  it('keeps timed and quick drafts after a blank-title cancellation', () => {
    const closeTimed = vi.fn();
    const closeQuick = vi.fn();
    const createTimed = vi.fn(() => ({ cancelled: true as const }));
    const createQuick = vi.fn(() => ({ cancelled: true as const }));
    const view = render(<><TimedTaskCreateRow open projects={projects} defaultProjectId="work" onCreate={createTimed} onCreateProject={vi.fn()} onClose={closeTimed} /><QuickTaskCreateRow open projects={projects} defaultProjectId="work" onCreate={createQuick} onCreateProject={vi.fn()} onClose={closeQuick} /></>);
    fireEvent.change(screen.getByPlaceholderText('任务名称（按 Enter 保存）'), { target: { value: '保留日程草稿' } });
    fireEvent.change(screen.getByPlaceholderText('待办内容（按 Enter 保存）'), { target: { value: '保留待办草稿' } });
    fireEvent.click(screen.getByTitle('保存任务'));
    fireEvent.click(screen.getByTitle('保存待办'));
    expect(closeTimed).toHaveBeenCalledOnce();
    expect(closeQuick).toHaveBeenCalledOnce();
    view.rerender(<><TimedTaskCreateRow open projects={projects} defaultProjectId="work" onCreate={createTimed} onCreateProject={vi.fn()} onClose={closeTimed} /><QuickTaskCreateRow open projects={projects} defaultProjectId="work" onCreate={createQuick} onCreateProject={vi.fn()} onClose={closeQuick} /></>);
    expect(screen.getByPlaceholderText('任务名称（按 Enter 保存）')).toHaveValue('保留日程草稿');
    expect(screen.getByPlaceholderText('待办内容（按 Enter 保存）')).toHaveValue('保留待办草稿');
  });
});
