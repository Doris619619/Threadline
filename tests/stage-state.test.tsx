/** @fileoverview 验证云阶段读取局部失败、隐藏回滚、防重入与账号切换期间的缓存隔离。 */
import { useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StagePlansProvider, useStagePlans } from '@/features/stage-plans/state';
import type { StagePlan } from '@/types/domain';
import { lockForDesktopUpdate } from '@/lib/cloud-write-guard';

const mocks = vi.hoisted(() => ({
  cloud: { user: { id: 'a' }, client: {} },
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  append: vi.fn(),
  remove: vi.fn(),
  delete: vi.fn(),
  setActive: vi.fn(),
}));
vi.mock('@/features/auth/cloud-runtime-provider', () => ({
  useOptionalCloudRuntime: () => mocks.cloud,
}));
vi.mock('@/components/app-shell', () => ({
  useWorkspaceView: () => ({ active: 'home', setActive: mocks.setActive }),
}));
vi.mock('@/features/stage-plans/repository', () => ({
  /** 提供真实异步边界的受控仓储替身，便于模拟网络返回与换号。 */
  StagePlanRepository: class {
    list = mocks.list;
    create = mocks.create;
    update = mocks.update;
    append = mocks.append;
    remove = mocks.remove;
    delete = mocks.delete;
  },
}));
const plan: StagePlan = {
  id: 'stage-a',
  name: '冲刺',
  startDate: '2026-10-01',
  endDate: '2026-10-08',
  homeVisible: true,
  createdAt: '2026-10-01',
  updatedAt: '2026-10-01T00:00:00.123456Z',
};
const clients: QueryClient[] = [];
/** 显示阶段独立状态，并捕获命令错误供回滚断言；原工作台内容始终可见。 */
function Consumer() {
  const stages = useStagePlans();
  const [error, setError] = useState('');
  const hide = () =>
    void stages
      .update(stages.plans[0], { homeVisible: false })
      .catch((failure) => setError(failure.message));
  return (
    <div>
      <p>原工作台可用</p>
      <output data-testid="plans">
        {stages.plans.map((item) => item.name + ':' + item.homeVisible).join(',')}
      </output>
      {stages.error && <p role="alert">{stages.error}</p>}
      <p>{error}</p>
      <button onClick={stages.retry}>重试阶段</button>
      <button onClick={hide}>隐藏</button>
      <button
        onClick={() =>
          void stages
            .create({ ...plan, tasks: [] })
            .catch((failure) => setError(failure.message))
        }
      >
        创建
      </button>
    </div>
  );
}
/** 每次渲染只装一个账号阶段提供器，Query 缓存保留账号键以验证旧回包边界。 */
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  const tree = () => (
    <QueryClientProvider client={client}>
      <StagePlansProvider tasks={[]} projects={[]} updateTasks={vi.fn()}>
        <Consumer />
      </StagePlansProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { client, view, tree };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cloud.user.id = 'a';
  mocks.list.mockResolvedValue([plan]);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

it('can retry after a desktop restart guard rejects a write before it is queued', async () => {
  mocks.create.mockResolvedValue({ plan, tasks: [] });
  setup();
  await waitFor(() =>
    expect(screen.getByTestId('plans')).toHaveTextContent('冲刺:true'),
  );
  const release = lockForDesktopUpdate();
  try {
    fireEvent.click(screen.getByText('创建'));
    await screen.findByText('正在重启更新，请稍后再保存。');
    expect(mocks.create).not.toHaveBeenCalled();
  } finally {
    release();
  }
  fireEvent.click(screen.getByText('创建'));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
});

it('keeps the workspace usable on stage-only read failure and recovers through retry', async () => {
  mocks.list.mockRejectedValueOnce(new Error('network offline'));
  setup();
  await screen.findByRole('alert');
  expect(screen.getByText('原工作台可用')).toBeVisible();
  fireEvent.click(screen.getByText('重试阶段'));
  await waitFor(() =>
    expect(screen.getByTestId('plans')).toHaveTextContent('冲刺:true'),
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('hides immediately, rejects a second in-flight write, then restores on save failure', async () => {
  let reject!: (reason: Error) => void;
  mocks.update.mockReturnValue(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  setup();
  await waitFor(() =>
    expect(screen.getByTestId('plans')).toHaveTextContent('冲刺:true'),
  );
  fireEvent.click(screen.getByText('隐藏'));
  await waitFor(() =>
    expect(screen.getByTestId('plans')).toHaveTextContent('冲刺:false'),
  );
  fireEvent.click(screen.getByText('隐藏'));
  await screen.findByText('正在保存这个阶段，请稍候。');
  expect(mocks.update).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('写入失败')));
  await screen.findByText('写入失败');
  await waitFor(() =>
    expect(screen.getByTestId('plans')).toHaveTextContent('冲刺:true'),
  );
});
it('does not apply an old account creation response into the new account stage or Task cache', async () => {
  let resolve!: (bundle: { plan: StagePlan; tasks: never[] }) => void;
  mocks.create.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { client, view, tree } = setup();
  await waitFor(() =>
    expect(screen.getByTestId('plans')).toHaveTextContent('冲刺:true'),
  );
  fireEvent.click(screen.getByText('创建'));
  mocks.cloud.user.id = 'b';
  mocks.list.mockResolvedValue([]);
  view.rerender(tree());
  await waitFor(() => expect(screen.getByTestId('plans')).toHaveTextContent(''));
  await act(async () => resolve({ plan, tasks: [] }));
  expect(client.getQueryData(['workspace', 'b', 'stage-plans'])).toEqual([]);
  expect(client.getQueryData(['workspace', 'b', 'tasks'])).toBeUndefined();
});
