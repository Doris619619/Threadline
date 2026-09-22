/** @fileoverview 验证多设备写入只传字段意图或可见成员命令，不回退整行与整集合替换。 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';
import { taskFieldChanges } from '@/lib/task-patch';
import {
  previewWorkstationCommand,
  type WorkstationCommand,
} from '@/lib/workstation-command';
import { useCloudWorkstation } from '@/features/workspace/use-cloud-workstation';
import type { Task } from '@/types/domain';
const original: Task = {
  id: 'a',
  projectId: 'p',
  title: 'original',
  date: '2026-09-21',
  status: 'active',
  importance: 'normal',
  completed: false,
  actualDurationMinutes: 10,
  createdAt: '',
  updatedAt: '',
};
afterEach(cleanup);
it('N09 sends only the edited title and guards the original workflow without comparing unrelated completion', async () => {
  const rpc = vi
    .fn()
    .mockResolvedValue({
      data: {
        id: 'a',
        title: 'new',
        project_id: 'p',
        status: 'active',
        completed: true,
        planned_start_time: null,
        planned_end_time: null,
        planned_duration_minutes: null,
        actual_duration_minutes: 10,
        created_at: '2026-09-21T00:00:00Z',
        updated_at: '2026-09-21T00:00:00Z',
      },
      error: null,
    });
  const repository = new SupabaseWorkspaceRepository({
    rpc,
  } as unknown as SupabaseClient);
  await repository.updateTaskFields(
    'a',
    taskFieldChanges(
      { ...original, title: 'new', updatedAt: 'new timestamp' },
      original,
    ),
    original,
  );
  expect(rpc).toHaveBeenCalledWith('update_task_fields', {
    p_task_id: 'a',
    p_changes: { title: 'new' },
    p_expected: {
      title: 'original',
      status: 'active',
      scheduled_date: '2026-09-21',
      deleted_at: null,
    },
  });
});
it('N09 guards the accounting project, date and cumulative actual and never retries an unsafe write', async () => {
  const rpc = vi
    .fn()
    .mockResolvedValue({
      data: null,
      error: { message: 'TASK_FIELD_CONFLICT:project_id' },
    });
  const from = vi.fn();
  const repository = new SupabaseWorkspaceRepository({
    rpc,
    from,
  } as unknown as SupabaseClient);
  await expect(
    repository.updateTaskFields('a', { actualDurationMinutes: 20 }, original),
  ).rejects.toThrow('草稿已保留');
  expect(rpc.mock.calls[0][1].p_expected).toMatchObject({
    project_id: 'p',
    actual_duration_minutes: 10,
    scheduled_date: '2026-09-21',
  });
  expect(from).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledOnce();
});
it('N07 preserves hidden remote members on add and clear-visible', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, gcTime: 0 } },
  });
  const key = ['workspace', 'owner', 'workstation'];
  client.setQueryData(key, ['a']);
  let server = ['a', 'b'];
  const repository = {
    listWorkstationTaskIds: vi.fn(async () => server),
    applyWorkstationCommand: vi.fn(async (command: WorkstationCommand) => {
      server = previewWorkstationCommand(server, command);
      return server;
    }),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useCloudWorkstation('owner', repository, vi.fn()), {
    wrapper,
  });
  act(() => hook.result.current.runWorkstationCommand({ type: 'add', id: 'c' }));
  await waitFor(() => expect(server).toEqual(['a', 'b', 'c']));
  act(() =>
    hook.result.current.runWorkstationCommand({ type: 'clear', ids: ['a', 'c'] }),
  );
  await waitFor(() => expect(server).toEqual(['b']));
  expect(repository.applyWorkstationCommand).toHaveBeenCalledTimes(2);
});
