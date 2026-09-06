/** @fileoverview 验证任务编辑失败保留用户草稿，重复提交在实际请求完成前被阻止。 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TaskDialog } from '@/features/tasks/components/task-dialogs';

it('preserves typed values and allows retry after a failed save', async () => {
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
  expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled();
  reject(new Error('网络暂时不可用'));
  await screen.findByRole('alert');
  expect(title).toHaveValue('保留这份草稿');
  expect(screen.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
});
