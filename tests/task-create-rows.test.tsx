/** @fileoverview 验证新增行关闭、首页卸载和空标题取消均不会丢失跨页面草稿。 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WaitingTaskCreateRow } from '@/features/tasks/components/waiting-task-create-row';
import { TimedTaskCreateRow } from '@/features/tasks/components/timed-task-create-row';
import { useTaskCreateDrafts } from '@/features/tasks/hooks/use-task-create-drafts';
import type { Project } from '@/types/domain';

const projects: Project[] = [
  { id: 'work', name: '工作', color: '#4f8cff', status: 'active', createdAt: '' },
];

/** 模拟首页被切出再返回；Hook 留在 Dashboard 层，新增行可卸载。 */
function DraftHarness({ home }: { home: boolean }) {
  const drafts = useTaskCreateDrafts();
  const createTimed = (draft: { title: string }) =>
    draft.title.trim() ? { task: {} } : { cancelled: true };
  const createQuick = (draft: { title: string }) =>
    draft.title.trim() ? { task: {} } : { cancelled: true };
  return home ? (
    <>
      <button onClick={() => drafts.openTimed('work')}>打开日程</button>
      <button onClick={() => drafts.openQuick('work')}>打开待办</button>
      <TimedTaskCreateRow
        open={drafts.timedOpen}
        draft={drafts.timedDraft}
        projects={projects}
        onCreate={createTimed}
        onCreateProject={() => projects[0]}
        onChange={drafts.updateTimedDraft}
        onReset={() => drafts.resetTimed('work')}
        onClose={drafts.closeTimed}
      />
      <WaitingTaskCreateRow
        open={drafts.quickOpen}
        draft={drafts.quickDraft}
        projects={projects}
        onCreate={createQuick}
        onCreateProject={() => projects[0]}
        onChange={drafts.updateQuickDraft}
        onReset={() => drafts.resetQuick('work')}
        onClose={drafts.closeQuick}
      />
    </>
  ) : (
    <p>其他页面</p>
  );
}

describe('task create row draft lifecycle', () => {
  it('keeps drafts after close/reopen and Dashboard child unmount, including actual blank-title cancellation', () => {
    const view = render(<DraftHarness home />);
    fireEvent.click(screen.getByText('打开日程'));
    fireEvent.click(screen.getByText('打开待办'));
    fireEvent.change(screen.getByPlaceholderText('任务名称（按 Enter 保存）'), {
      target: { value: '日程草稿' },
    });
    fireEvent.change(screen.getByPlaceholderText('事项内容'), {
      target: { value: '待办草稿' },
    });
    fireEvent.click(screen.getAllByTitle('取消')[0]);
    fireEvent.click(screen.getAllByTitle('取消')[0]);
    fireEvent.click(screen.getByText('打开日程'));
    fireEvent.click(screen.getByText('打开待办'));
    expect(screen.getByPlaceholderText('任务名称（按 Enter 保存）')).toHaveValue(
      '日程草稿',
    );
    expect(screen.getByPlaceholderText('事项内容')).toHaveValue('待办草稿');
    view.rerender(<DraftHarness home={false} />);
    view.rerender(<DraftHarness home />);
    fireEvent.click(screen.getByText('打开日程'));
    fireEvent.click(screen.getByText('打开待办'));
    expect(screen.getByPlaceholderText('任务名称（按 Enter 保存）')).toHaveValue(
      '日程草稿',
    );
    expect(screen.getByPlaceholderText('事项内容')).toHaveValue('待办草稿');
  });
});

it('retains a timed draft and exposes a retryable error when persistence rejects', async () => {
  const onReset = vi.fn();
  const onClose = vi.fn();
  const onChange = vi.fn();
  render(
    <TimedTaskCreateRow
      open
      draft={{
        title: '不能丢失的任务',
        projectId: 'work',
        projectName: '',
        startTime: '08:30',
        endTime: '',
        planned: '',
        actual: '',
        completed: false,
        isAddingProject: false,
      }}
      projects={projects}
      onCreate={async () => {
        throw new Error('网络写入失败');
      }}
      onCreateProject={async () => projects[0]}
      onChange={onChange}
      onReset={onReset}
      onClose={onClose}
    />,
  );
  fireEvent.click(screen.getAllByTitle('保存任务').at(-1)!);
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({ timeError: '网络写入失败' }),
  );
  expect(onReset).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(
    screen.getAllByPlaceholderText('任务名称（按 Enter 保存）').at(-1),
  ).toHaveValue('不能丢失的任务');
});

it('does not preview a zero-minute duration that the save layer rejects', () => {
  render(
    <TimedTaskCreateRow
      open
      draft={{
        title: '零时长任务',
        projectId: 'work',
        projectName: '',
        startTime: '08:30',
        endTime: '08:30',
        planned: '',
        actual: '',
        completed: false,
        isAddingProject: false,
      }}
      projects={projects}
      onCreate={async () => ({ task: {} })}
      onCreateProject={async () => projects[0]}
      onChange={() => undefined}
      onReset={() => undefined}
      onClose={() => undefined}
    />,
  );

  expect(screen.getAllByLabelText('预计时长').at(-1)).toHaveTextContent('自动计算');
});

it('ensures timed create row groups project select and task title in the same primary row container', () => {
  const { container } = render(
    <TimedTaskCreateRow
      open
      draft={{
        title: '',
        projectId: 'work',
        projectName: '',
        startTime: '',
        endTime: '',
        planned: '',
        actual: '',
        completed: false,
        isAddingProject: false,
      }}
      projects={projects}
      onCreate={async () => ({ task: {} })}
      onCreateProject={async () => projects[0]}
      onChange={() => undefined}
      onReset={() => undefined}
      onClose={() => undefined}
    />,
  );

  const primaryRow = container.querySelector('.timed-create-primary');
  expect(primaryRow).not.toBeNull();
  expect(primaryRow?.querySelector('.project-inline-select')).not.toBeNull();
  expect(primaryRow?.querySelector('.timed-create-title-input')).not.toBeNull();
});
