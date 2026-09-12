/** @fileoverview 用挂起/失败请求验证管理弹窗和待安排按钮的防连点、草稿保留与重试。 */
import { createRef } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ProjectPanel,
  type ProjectPanelHandle,
} from '@/features/projects/project-panel';
import {
  DailyTemplateManager,
  type DailyTemplateManagerHandle,
} from '@/features/daily/daily-template-manager';
import { WaitingTaskRow } from '@/features/tasks/components/waiting-task-row';

/** 可控请求让断言发生在保存完成前，而非依赖短暂的网络时差。 */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(cleanup);

for (const kind of ['项目', 'Daily'] as const) {
  it(`${kind} creation locks once, keeps failure inside dialog and preserves its draft for retry`, async () => {
    const request = deferred();
    const save = vi.fn(() => request.promise);
    const ref = createRef<ProjectPanelHandle & DailyTemplateManagerHandle>();
    if (kind === '项目')
      render(
        <ProjectPanel
          ref={ref}
          items={[]}
          onCreateProject={save}
          onUpdateProject={vi.fn()}
          onSetProjectArchived={vi.fn()}
          onDeleteProject={vi.fn()}
        />,
      );
    else
      render(
        <DailyTemplateManager
          ref={ref}
          items={[]}
          onCreate={save}
          onSave={vi.fn()}
          onSetStatus={vi.fn()}
          onSetItemStatus={vi.fn()}
        />,
      );
    act(() => ref.current!.openCreate());
    const dialog = screen.getByRole('dialog');
    const field = within(dialog).getByRole('textbox');
    fireEvent.change(field, { target: { value: '保留这份草稿' } });
    const submit = within(dialog).getByRole('button', { name: '创建', exact: true });
    act(() => {
      submit.click();
      submit.click();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    expect(field).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    await act(async () => request.reject(new Error('网络断开')));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('网络断开');
    expect(field).toHaveValue('保留这份草稿');
    save.mockResolvedValueOnce(undefined);
    fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(save).toHaveBeenCalledTimes(2);
  });
}

it('waiting schedule responds immediately, blocks repeat clicks and allows retry after failure', async () => {
  const request = deferred();
  const schedule = vi.fn(() => request.promise);
  render(
    <WaitingTaskRow
      task={{
        id: 'one',
        title: '待安排',
        projectId: 'p',
        status: 'waiting',
        completed: false,
        createdAt: '2026-09-12',
      }}
      projects={[]}
      onSchedule={schedule}
      onComplete={vi.fn()}
      onDelete={vi.fn()}
      onEdit={vi.fn()}
    />,
  );
  const more = screen.getByRole('button', { name: '待安排更多操作' });
  fireEvent.click(more);
  const submit = screen.getByRole('menuitem', { name: '安排到今天' });
  act(() => {
    submit.click();
    submit.click();
  });
  expect(schedule).toHaveBeenCalledTimes(1);
  expect(more).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('正在保存');
  await act(async () => request.reject(new Error('稍后重试')));
  expect(screen.getByRole('alert')).toHaveTextContent('稍后重试');
  expect(more).not.toBeDisabled();
  schedule.mockResolvedValueOnce(undefined);
  fireEvent.click(more);
  fireEvent.click(screen.getByRole('menuitem', { name: '安排到今天' }));
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(schedule).toHaveBeenCalledTimes(2);
});
