/** @fileoverview 用正式云 Workspace Provider 组合验证缓存失败和乐观删除不会清理批注。 */
import { useEffect, type ReactNode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import {
  WorkspaceDataProvider,
  useWorkspaceData,
} from '@/features/workspace/workspace-data-provider';
import {
  StartupProgressProvider,
  useOptionalStartupProgress,
} from '@/features/startup/startup-progress-context';
import { annotationAccountKey } from '@/lib/annotation-account-storage';
const fixture = vi.hoisted(() => ({ runtime: {} as unknown }));
vi.mock('@/features/auth/cloud-runtime-provider', () => ({
  useCloudRuntime: () => fixture.runtime,
  useOptionalCloudRuntime: () => fixture.runtime,
}));
vi.mock('@/components/app-shell', () => ({
  useWorkspaceView: () => ({ selectedDate: '2026-09-21' }),
}));
vi.mock('@/lib/workspace-runtime', () => ({
  usesLocalWorkspace: () => false,
  workspaceStorageKey: (key: string) => key,
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
/** 保留真实启动桥接和业务消费者，测试能观察遮罩以及永久批注变化。 */
function Consumer() {
  const progress = useOptionalStartupProgress();
  const timezone = progress?.setAccountTimezoneStatus;
  useEffect(() => {
    timezone?.({ status: 'completed' });
  }, [timezone]);
  const data = useWorkspaceData();
  return (
    <>
      <p>visible workspace</p>
      <output data-testid="strokes">{data.annotationStrokes.length}</output>
      <output data-testid="status">{data.tasks[0]?.status}</output>
      <button
        onClick={() => void data.transitionTask('t', 'trashed').catch(() => undefined)}
      >
        trash
      </button>
    </>
  );
}
/** 独立缓存及可控 RPC，查询 mock 只替换网络边界。 */
function setup() {
  const task = {
    id: 't',
    title: 'task',
    projectId: 'p',
    date: '2026-09-21',
    status: 'active',
    importance: 'normal',
    completed: false,
    createdAt: '',
    updatedAt: '',
  };
  const repository = {
    listTasks: vi.fn(async () => [task]),
    listProjects: vi.fn(async () => []),
    listTaskTimeEntries: vi.fn(async () => []),
    listDailyBundle: vi.fn(async () => ({
      dailyTemplates: [],
      dailyByDate: { '2026-09-21': [] },
    })),
    listDailyHistory: vi.fn(async () => []),
    listHistory: vi.fn(async () => []),
    listCloseRecords: vi.fn(async () => []),
    listWorkstationTaskIds: vi.fn(async () => ['t']),
    findTasksByIds: vi.fn(async () => []),
    transitionTask: vi.fn(),
  };
  const channel = { on: () => channel, subscribe: () => channel };
  fixture.runtime = {
    user: { id: 'A' },
    repository,
    client: { channel: () => channel, removeChannel: vi.fn() },
  };
  localStorage.setItem(
    annotationAccountKey('A'),
    JSON.stringify({
      strokes: [
        {
          id: 's',
          targetScope: 'global',
          targetTaskId: 't',
          color: '#f00',
          strokeWidth: 2,
          createdAt: '',
          points: [{ x: 0.1, y: 0.1 }],
        },
      ],
      imported: [],
    }),
  );
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={query}>
      <StartupProgressProvider
        active
        authentication={{ status: 'completed' }}
        workspaceInitialization={{ status: 'completed' }}
      >
        {children}
      </StartupProgressProvider>
    </QueryClientProvider>
  );
  render(
    <WorkspaceDataProvider>
      <Consumer />
    </WorkspaceDataProvider>,
    { wrapper },
  );
  return { repository, query, task };
}
it('K01 background query failure keeps the hydrated workspace visible and offers retry', async () => {
  const ctx = setup();
  await waitFor(() =>
    expect(screen.queryByLabelText('Threadline 启动进度')).not.toBeInTheDocument(),
  );
  ctx.repository.listTasks.mockRejectedValue(new Error('background offline'));
  await act(() =>
    ctx.query.invalidateQueries({ queryKey: ['workspace', 'A', 'tasks'] }),
  );
  await screen.findByRole('button', { name: '重试同步' });
  expect(screen.queryByLabelText('Threadline 启动进度')).not.toBeInTheDocument();
  expect(screen.getByText('visible workspace')).toBeVisible();
  expect(screen.getByRole('button', { name: '重试同步' })).toBeVisible();
  expect(screen.getByTestId('strokes')).toHaveTextContent('1');
});
it('N04 optimistic trash and failed RPC retain annotations until server confirmation', async () => {
  const ctx = setup();
  await waitFor(() => expect(screen.getByTestId('strokes')).toHaveTextContent('1'));
  let reject!: (error: Error) => void;
  ctx.repository.transitionTask.mockImplementation(
    () =>
      new Promise((_resolve, no) => {
        reject = no;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'trash' }));
  await waitFor(() => expect(ctx.repository.transitionTask).toHaveBeenCalled());
  expect(screen.getByTestId('status')).toHaveTextContent('trashed');
  expect(screen.getByTestId('strokes')).toHaveTextContent('1');
  await act(async () => reject(new Error('delete offline')));
  expect(screen.getByTestId('strokes')).toHaveTextContent('1');
  ctx.repository.transitionTask.mockResolvedValue({ ...ctx.task, status: 'trashed' });
  fireEvent.click(screen.getByRole('button', { name: 'trash' }));
  await waitFor(() => expect(screen.getByTestId('strokes')).toHaveTextContent('0'));
});
