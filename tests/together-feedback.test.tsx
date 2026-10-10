/** @fileoverview 用真实表单锁和查询缓存验证两人空间的稳定操作文案、失败草稿、分页内容与持久互动结果。 */
import { QueryClient } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BindingPanel } from '@/features/together/binding';
import { FlagList } from '@/features/together/flag-board';
import { FlagCard } from '@/features/together/flag-card';
import { togetherCopy } from '@/features/together/copy';
import type { Flag, Room } from '@/features/together/types';

const { getStore, readFlags } = vi.hoisted(() => ({
  getStore: vi.fn(),
  readFlags: vi.fn(),
}));
vi.mock('@/features/together/state', () => ({ useTogether: () => getStore() }));
vi.mock('@/features/together/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/together/repository')>()),
  readFlags,
}));

const room: Room = {
  id: 'room',
  user_a: 'mine',
  user_b: 'theirs',
  name_a: '小桃',
  name_b: '小熊',
  nickname_a: null,
  nickname_b: null,
  relationship: 'couple',
  proposed_relationship: null,
  proposed_by: null,
  affection: 0,
  version: 1,
  created_at: '2026-10-10T10:00:00Z',
  ended_at: null,
};

/** 创建完整便笺，让分页测试核对真实卡片是否在等待与失败时留在页面。 */
function flag(id: string): Flag {
  return {
    id,
    room_id: room.id,
    owner_id: 'theirs',
    title: `目标 ${id}`,
    description: '',
    reward: '',
    deadline: '2099-10-10T10:00:00Z',
    timezone: 'UTC',
    status: 'active',
    version: 1,
    first_submitted_at: null,
    current_submission_id: null,
    completed_at: null,
    created_at: room.created_at,
    cancelled_reason: null,
  };
}

/** 由测试控制网络结果，保证断言覆盖请求仍挂起的阶段。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

let cache: QueryClient;
const run = vi.fn();
const rpc = vi.fn();
beforeEach(() => {
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  run.mockReset();
  rpc.mockReset();
  readFlags.mockReset();
  cache.setQueryData(['together', 'mine', 'profile'], null);
  cache.setQueryData(['together', 'mine', 'invite'], null);
  getStore.mockReturnValue({ client: { rpc }, cache, user: 'mine', run });
});
afterEach(() => {
  cleanup();
  cache.clear();
});

it('profile saving keeps its label, blocks duplicates and preserves the failed draft without a busy status', async () => {
  const request = deferred<Record<string, unknown>>();
  const retry = deferred<Record<string, unknown>>();
  run
    .mockReturnValueOnce(request.promise)
    .mockReturnValueOnce(retry.promise)
    .mockResolvedValueOnce({ saved: true });
  render(<BindingPanel />);
  const field = screen.getByRole('textbox');
  fireEvent.change(field, { target: { value: '小桃的新称呼' } });
  const save = screen.getByRole('button', { name: '保存称呼' });
  fireEvent.submit(save.closest('form')!);
  fireEvent.submit(save.closest('form')!);
  expect(run).toHaveBeenCalledTimes(1);
  expect(save).toBeDisabled();
  expect(save).toHaveTextContent('保存称呼');
  expect(field).toBeDisabled();
  expect(save.closest('.together-binding')).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();

  await act(async () => request.reject(new Error('网络断开')));
  expect(screen.getByRole('alert')).toHaveTextContent('网络断开');
  expect(field).toHaveValue('小桃的新称呼');
  expect(save).not.toBeDisabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();

  const original = run.mock.calls[0][0];
  fireEvent.submit(save.closest('form')!);
  expect(screen.getByRole('alert')).toHaveTextContent('网络断开');
  expect(save).toBeDisabled();
  expect(run.mock.calls[1][0]).toEqual(original);
  await act(async () => retry.reject(new Error('仍然无法连接')));
  expect(screen.getByRole('alert')).toHaveTextContent('仍然无法连接');
  expect(field).toHaveValue('小桃的新称呼');
  fireEvent.submit(save.closest('form')!);
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(run.mock.calls[2][0]).toEqual(original);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('invite inspection retains its label while pending and keeps the code after failure', async () => {
  cache.setQueryData(['together', 'mine', 'profile'], { display_name: '小桃' });
  const request = deferred<unknown>();
  const retry = deferred<unknown>();
  rpc.mockReturnValueOnce(request.promise).mockReturnValueOnce(retry.promise);
  render(<BindingPanel />);
  fireEvent.click(screen.getByRole('button', { name: '输入邀请码' }));
  const field = screen.getByRole('textbox', { name: '对方的邀请码' });
  fireEvent.change(field, { target: { value: 'ABC123' } });
  const inspect = screen.getByRole('button', { name: '查看邀请' });
  fireEvent.click(inspect);
  expect(inspect).toBeDisabled();
  expect(inspect).toHaveTextContent('查看邀请');
  expect(inspect.closest('.together-binding')).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByText('正在查看…')).not.toBeInTheDocument();

  await act(async () => request.reject(new Error('邀请读取失败')));
  expect(screen.getByRole('alert')).toHaveTextContent('邀请读取失败');
  expect(field).toHaveValue('ABC123');
  expect(inspect).not.toBeDisabled();
  expect(inspect).toHaveTextContent('查看邀请');
  fireEvent.click(inspect);
  expect(screen.getByRole('alert')).toHaveTextContent('邀请读取失败');
  expect(inspect).toBeDisabled();
  await act(async () =>
    retry.resolve({
      data: { id: 'invite', name: '小熊', relationship: 'couple' },
      error: null,
    }),
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '接受邀请' })).toBeInTheDocument();
});

it('loading another page retains existing cards and its button label through pending and failure', async () => {
  const first = Array.from({ length: 20 }, (_, index) => flag(String(index)));
  cache.setQueryData(['together', 'mine', 'flags', room.id, 'theirs', 'theirs'], {
    pages: [first],
    pageParams: [0],
  });
  cache.setQueryData(
    ['together', 'mine', 'card-marks', room.id, first.map((item) => item.id)],
    [],
  );
  const request = deferred<Flag[]>();
  readFlags.mockReturnValue(request.promise);
  render(<FlagList room={room} mode="theirs" owner="theirs" onOpen={vi.fn()} />);
  const original = screen.getByRole('button', { name: '目标 0' });
  const more = screen.getByRole('button', { name: '再看一些' });
  fireEvent.click(more);
  await waitFor(() => expect(more).toHaveAttribute('aria-busy', 'true'));
  expect(more).toBeDisabled();
  expect(more).toHaveTextContent('再看一些');
  expect(original).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();

  await act(async () => request.reject(new Error('下一页读取失败')));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('下一页读取失败'),
  );
  expect(screen.getByRole('button', { name: '目标 0' })).toBe(original);
  expect(more).not.toBeDisabled();
  expect(more).toHaveTextContent('再看一些');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('cheering retains meaningful result feedback after the write finishes', async () => {
  const request = deferred<{ points: number }>();
  run.mockReturnValue(request.promise);
  const item = flag('cheer');
  const view = render(
    <FlagCard
      room={room}
      flag={item}
      zone="UTC"
      cheered={false}
      surprise={false}
      marksReady
      onOpen={vi.fn()}
    />,
  );
  const cheer = screen.getByRole('button', { name: togetherCopy.couple.cheer });
  fireEvent.click(cheer);
  expect(cheer).toBeDisabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await act(async () => request.resolve({ points: 1 }));
  expect(screen.getByRole('status')).toHaveTextContent('好感度 +1');
  view.rerender(
    <FlagCard
      room={room}
      flag={item}
      zone="UTC"
      cheered
      surprise={false}
      marksReady
      onOpen={vi.fn()}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('好感度 +1');
});
