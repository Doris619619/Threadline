/** @fileoverview 验证任务编辑保持操作名称、失败保留用户草稿，实际请求完成前禁止重复提交。 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TaskDialog } from '@/features/tasks/components/task-dialogs';

it('returns focus to the opening control after the editor closes', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const { unmount } = render(
    <TaskDialog open projects={[]} onSave={vi.fn()} onClose={vi.fn()} />,
  );
  expect(screen.getByRole('textbox', { name: '任务名称' })).toHaveFocus();
  unmount();
  expect(trigger).toHaveFocus();
  trigger.remove();
});

it('preserves typed values and the error through consecutive failed retries', async () => {
  let reject!: (error: Error) => void;
  const save = vi.fn(
    () =>
      new Promise<string | undefined>((_, fail) => {
        reject = fail;
      }),
  );
  render(
    <TaskDialog
      open
      projects={[
        { id: 'p', name: '研究', color: '#0066d6', status: 'active', createdAt: '' },
      ]}
      onSave={save}
      onClose={vi.fn()}
    />,
  );
  const title = screen.getByRole('textbox', { name: '任务名称' });
  fireEvent.change(title, { target: { value: '保留这份草稿' } });
  fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  expect(title.closest('form')).toHaveAttribute('aria-busy', 'true');
  reject(new Error('网络暂时不可用'));
  await screen.findByRole('alert');
  expect(title).toHaveValue('保留这份草稿');
  expect(screen.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  const error = screen.getByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  expect(save).toHaveBeenCalledTimes(2);
  expect(error).toHaveTextContent('网络暂时不可用');
  expect(error).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  reject(new Error('网络暂时不可用'));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '保存', exact: true })).toBeEnabled(),
  );
  expect(screen.getByRole('alert')).toBe(error);
  expect(title).toHaveValue('保留这份草稿');
});
