/** @fileoverview 覆盖 PR 复审中的时间精度、排队冲突、编辑快照和 RPC 截断边界。 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';
import { useCloudTaskUpdates } from '@/features/workspace/use-cloud-task-updates';
import { TaskLine } from '@/features/tasks/components/task-line';
import type { Task } from '@/types/domain';
import { TaskConflictError } from '@/lib/task-patch';
import { getPendingCloudWrites } from '@/lib/cloud-write-guard';
import { TaskConflictDrafts } from '@/features/workspace/task-conflict-drafts';

const original: Task = {
  id: 'a',
  title: 'original',
  projectId: 'p',
  status: 'active',
  importance: 'normal',
  completed: false,
  createdAt: '2026-09-22T00:00:00Z',
};
const databaseRow = {
  id: 'a',
  title: 'original',
  project_id: 'p',
  status: 'trashed',
  importance: 'normal',
  completed: false,
  planned_start_time: null,
  planned_end_time: null,
  planned_duration_minutes: null,
  actual_duration_minutes: null,
  created_at: '2026-09-22T00:00:00Z',
  updated_at: '2026-09-22T00:00:00Z',
  deleted_at: '2026-09-22T04:00:00.123456+00:00',
};

/** 使用真实 SDK 查询构造器和真实映射，只替换 HTTP 传输。 */
function repositoryWithFetch(fetcher: typeof fetch) {
  return new SupabaseWorkspaceRepository(
    createClient('https://example.supabase.co', 'test-key', {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: crypto.randomUUID(),
      },
      global: { fetch: fetcher },
    }),
  );
}
afterEach(cleanup);

it('R1 passes the exact deletion instant through listTasks/mapTask/restoreTask and still rejects a changed deletion', async () => {
  let deletedAt = databaseRow.deleted_at;
  const repository = repositoryWithFetch(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/tasks'))
      return Response.json(
        url.searchParams.has('id') ? [] : [{ ...databaseRow, deleted_at: deletedAt }],
      );
    const args = JSON.parse(String(init?.body));
    return args.p_expected_deleted_at === deletedAt
      ? Response.json({ ...databaseRow, status: 'active', deleted_at: null })
      : Response.json(
          { code: '40001', message: 'TASK_FIELD_CONFLICT:status' },
          { status: 409 },
        );
  });
  const [mapped] = await repository.listTasks();
  expect((await repository.restoreTask('a', '2099-01-01', mapped)).status).toBe(
    'active',
  );
  deletedAt = '2026-09-22T04:00:00.123457+00:00';
  await expect(repository.restoreTask('a', '2099-01-01', mapped)).rejects.toThrow(
    /冲突|修改|CONFLICT/,
  );
});

it('R4 ignores a capped write response and publishes all 1001 members after add and move', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    id: String(index).padStart(5, '0'),
    task_id: `task-${index}`,
    position: index,
    removed_at: null,
  }));
  const writes = vi.fn();
  const repository = repositoryWithFetch(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/rpc/')) {
      writes();
      return Response.json(rows.slice(0, 1000));
    }
    const cursor = url.searchParams.get('id')?.slice(3);
    return Response.json(
      rows.filter((row) => !cursor || row.id > cursor).slice(0, 500),
    );
  });
  for (const command of [
    { type: 'add' as const, id: 'task-1000' },
    { type: 'move' as const, id: 'task-1000', anchor: 'task-0', after: false },
  ]) {
    expect(await repository.applyWorkstationCommand(command)).toEqual(
      rows.map((row) => row.task_id),
    );
  }
  expect(writes).toHaveBeenCalledTimes(2);
});

it('R2 stops older queued edits after a conflict and retains the last draft', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } },
  });
  client.setQueryData(['workspace', 'owner', 'tasks'], [original]);
  let reject!: (error: Error) => void;
  const first = new Promise<Task>((_, no) => {
    reject = no;
  });
  const remote = { ...original, title: 'remote-new' };
  const repository = {
    listTasks: vi.fn(async () => [remote]),
    updateTaskFields: vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue({ ...original, title: 'local-second' }),
    restoreTask: vi.fn(),
    listTaskTimeEntries: vi.fn(async () => []),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useCloudTaskUpdates('owner', repository, vi.fn()), {
    wrapper,
  });
  act(() => hook.result.current.updateTasks([{ ...original, title: 'local-first' }]));
  await waitFor(() => expect(repository.updateTaskFields).toHaveBeenCalledOnce());
  act(() => hook.result.current.updateTasks([{ ...original, title: 'local-second' }]));
  await act(async () => reject(new TaskConflictError()));
  expect(repository.updateTaskFields).toHaveBeenCalledOnce();
  expect(hook.result.current.tasks[0].title).toBe('remote-new');
  expect(hook.result.current.conflictedDrafts[0].draft.title).toBe('local-second');
  expect(getPendingCloudWrites()).toBe(0);
});

it('R2 also rejects a queued command, preserves the final draft when readback fails, and isolates accounts', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } },
  });
  client.setQueryData(['workspace', 'owner', 'tasks'], [original]);
  let reject!: (error: Error) => void;
  const first = new Promise<Task>((_, no) => {
    reject = no;
  });
  const repository = {
    listTasks: vi.fn().mockRejectedValue(new Error('offline')),
    updateTaskFields: vi.fn(() => first),
    restoreTask: vi.fn(),
    listTaskTimeEntries: vi.fn(async () => []),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ owner }) => useCloudTaskUpdates(owner, repository, vi.fn()),
    { wrapper, initialProps: { owner: 'owner' } },
  );
  const operation = vi.fn(async (row: Task) => row);
  let queued!: Promise<unknown>;
  act(() => {
    hook.result.current.updateTasks([{ ...original, title: 'first' }]);
    queued = hook.result.current
      .commitTask('a', (row) => ({ ...row, title: 'final' }), operation)
      .catch((error) => error);
  });
  await waitFor(() => expect(repository.updateTaskFields).toHaveBeenCalledOnce());
  await act(async () => {
    reject(new TaskConflictError());
    await queued;
  });
  expect(operation).not.toHaveBeenCalled();
  expect(hook.result.current.conflictedDrafts[0].draft.title).toBe('final');
  expect(getPendingCloudWrites()).toBe(0);
  hook.rerender({ owner: 'another-owner' });
  expect(hook.result.current.conflictedDrafts).toEqual([]);
});

it('R2 makes the final draft readable and only clears it on explicit dismissal', () => {
  const dismiss = vi.fn();
  render(
    <TaskConflictDrafts
      drafts={[{ original, draft: { ...original, title: 'last draft' } }]}
      tasks={[{ ...original, title: 'remote title' }]}
      projects={[]}
      onDismiss={dismiss}
    />,
  );
  fireEvent.click(screen.getByText('保存冲突，查看保留草稿：last draft'));
  expect(screen.getByText('remote title')).toBeVisible();
  expect(screen.getByText('last draft', { exact: true })).toBeVisible();
  expect(dismiss).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '已处理，清除此草稿' }));
  expect(dismiss).toHaveBeenCalledWith('a');
});

it('R3 keeps the inline edit original across a remote render and retains a rejected draft', async () => {
  const onUpdate = vi.fn(async (_next: Task, expected?: Task) => {
    if (expected?.title !== 'remote-new') throw new Error('任务已在其他设备修改');
  });
  const props = {
    projects: [],
    onUpdate,
    onEdit: vi.fn(),
    onMove: vi.fn(),
    onReschedule: vi.fn(),
  };
  const view = render(<TaskLine task={original} {...props} />);
  fireEvent.click(screen.getByText('original'));
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'local draft' } });
  view.rerender(<TaskLine task={{ ...original, title: 'remote-new' }} {...props} />);
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() =>
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'local draft' }),
      original,
    ),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('其他设备');
  expect(input).toHaveValue('local draft');
  expect(input).toBeInTheDocument();
});

it('R3 guards actual minutes with the original project and deduplicates Enter plus blur while saving', async () => {
  const initial = { ...original, actualDurationMinutes: 10 };
  let resolve!: () => void;
  const saved = new Promise<void>((yes) => {
    resolve = yes;
  });
  const onUpdate = vi.fn(() => saved);
  const props = {
    projects: [],
    onUpdate,
    onEdit: vi.fn(),
    onMove: vi.fn(),
    onReschedule: vi.fn(),
    inSchedulePanel: true,
  };
  const view = render(<TaskLine task={initial} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'original实际耗时' }));
  const input = screen.getByPlaceholderText('30min');
  fireEvent.change(input, { target: { value: '20min' } });
  view.rerender(
    <TaskLine
      task={{ ...initial, projectId: 'remote-project', actualDurationMinutes: 15 }}
      {...props}
    />,
  );
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.blur(input);
  expect(onUpdate).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ actualDurationMinutes: 20, projectId: 'p' }),
    initial,
  );
  expect(input).toHaveAttribute('readonly');
  expect(input).toBeInTheDocument();
  await act(async () => resolve());
  expect(input).not.toBeInTheDocument();
});

it('R4 never repeats a write or returns a partial collection when post-command pagination fails', async () => {
  const writes = vi.fn();
  const repository = repositoryWithFetch(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/rpc/')) {
      writes();
      return Response.json([{ task_id: 'a' }]);
    }
    if (url.searchParams.has('id'))
      return Response.json({ message: 'read unavailable' }, { status: 403 });
    return Response.json([{ id: 'a', task_id: 'a', position: 0 }]);
  });
  await expect(
    repository.applyWorkstationCommand({ type: 'add', id: 'a' }),
  ).rejects.toThrow('read unavailable');
  expect(writes).toHaveBeenCalledOnce();
});
