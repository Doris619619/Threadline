/** @fileoverview 验证慢保存期间草稿锁定、连续回车防重复和中文输入法确认不会误提交。 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TimedTaskCreateRow } from '@/features/tasks/components/timed-task-create-row';
import { WaitingTaskCreateRow } from '@/features/tasks/components/waiting-task-create-row';
import type { Project } from '@/types/domain';

afterEach(cleanup);
const project: Project = {
  id: 'p',
  name: '项目',
  color: '#123456',
  status: 'active',
  createdAt: '',
};

it.each(['timed', 'waiting'] as const)(
  '%s draft survives a slow save without duplicate requests or premature reset',
  async (kind) => {
    let finish!: (value: { task: unknown }) => void;
    const pending = new Promise<{ task: unknown }>((resolve) => {
      finish = resolve;
    });
    const onCreate = vi.fn(() => pending);
    const order: string[] = [];
    const props = {
      open: true,
      projects: [project],
      onCreate,
      onCreateProject: async () => project,
      onChange: vi.fn(),
      onClose: vi.fn(() => {
        order.push('close');
      }),
      onReset: vi.fn(() => {
        order.push('reset');
      }),
      draft: {
        title: '保留慢请求草稿',
        projectId: 'p',
        projectName: '',
        isAddingProject: false,
        completed: false,
        importance: 'normal' as const,
        planned: '',
        actual: '',
        startTime: '',
        endTime: '',
      },
    };
    render(
      kind === 'timed' ? (
        <TimedTaskCreateRow {...props} />
      ) : (
        <WaitingTaskCreateRow {...props} />
      ),
    );
    const form = screen.getByRole('group');
    const input = within(form).getByPlaceholderText(
      kind === 'timed' ? '任务名称（按 Enter 保存）' : '事项内容',
    );
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(input).toBeDisabled();
    expect(input).toHaveValue('保留慢请求草稿');
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(order).toEqual([]);
    await act(async () => finish({ task: {} }));
    expect(order).toEqual(['close', 'reset']);
  },
);
