/** @fileoverview 全局账号时区确认、失败与迟到读取隔离；真实 Provider 配可控云边界。 */
import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  AccountTimezoneProvider,
  useAccountTimezone,
} from '@/features/settings/account-timezone-provider';
import { getAccountTimezone, setAccountTimezone } from '@/lib/account-clock';
import { emptyHabitData } from '@/features/habits/habit-local-repository';

const mocks = vi.hoisted(() => ({ read: vi.fn(), rpc: vi.fn(), owner: 'account-a' }));
vi.mock('@/features/auth/cloud-runtime-provider', () => ({
  useOptionalCloudRuntime: () => ({ user: { id: mocks.owner }, client }),
}));
const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
const client = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }) }),
  rpc: mocks.rpc,
  channel: () => channel,
  removeChannel: vi.fn(),
};
/** 制作有明确账号和版本的服务器确认。 */
const settings = (timezone: string, version = 0, owner = 'account-a') => ({
  ...emptyHabitData(timezone).settings,
  owner_id: owner,
  version,
});
beforeEach(() => {
  mocks.owner = 'account-a';
  mocks.read.mockResolvedValue({ data: settings('Asia/Shanghai'), error: null });
});
afterEach(() => {
  cleanup();
  setAccountTimezone(undefined);
  vi.clearAllMocks();
});
it('loads the account choice before rendering business consumers', async () => {
  const hook = renderHook(useAccountTimezone, { wrapper: AccountTimezoneProvider });
  await waitFor(() =>
    expect(hook.result.current?.settings?.timezone).toBe('Asia/Shanghai'),
  );
  expect(getAccountTimezone()).toBe('Asia/Shanghai');
});
it('accepts the PostgREST singleton array for first-login initialization', async () => {
  mocks.read.mockResolvedValue({ data: null, error: null });
  mocks.rpc.mockResolvedValue({ data: [settings('Asia/Shanghai')], error: null });
  const hook = renderHook(useAccountTimezone, { wrapper: AccountTimezoneProvider });
  await waitFor(() =>
    expect(hook.result.current?.settings?.timezone).toBe('Asia/Shanghai'),
  );
});
it('keeps a saved preference when a later focus refresh returns an older version', async () => {
  const hook = renderHook(useAccountTimezone, { wrapper: AccountTimezoneProvider });
  await waitFor(() => expect(hook.result.current).not.toBeNull());
  mocks.rpc.mockResolvedValue({ data: [settings('America/New_York', 1)], error: null });
  await act(async () =>
    hook.result.current!.saveTimezone('America/New_York', 0, 'stable-request'),
  );
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(getAccountTimezone()).toBe('America/New_York');
  expect(hook.result.current?.settings?.version).toBe(1);
});
it('never applies a failed timezone write', async () => {
  const hook = renderHook(useAccountTimezone, { wrapper: AccountTimezoneProvider });
  await waitFor(() => expect(hook.result.current).not.toBeNull());
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });
  await act(async () => {
    await expect(
      hook.result.current!.saveTimezone('UTC', 0, 'same-request'),
    ).rejects.toThrow('timeout');
  });
  expect(getAccountTimezone()).toBe('Asia/Shanghai');
});
it('ignores a previous account write that finishes after sign out and account change', async () => {
  const hook = renderHook(useAccountTimezone, { wrapper: AccountTimezoneProvider });
  await waitFor(() => expect(hook.result.current).not.toBeNull());
  let resolve!: (value: unknown) => void;
  mocks.rpc.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let saving!: Promise<void>;
  act(() => {
    saving = hook.result.current!.saveTimezone('UTC', 0, 'late-request');
  });
  mocks.owner = 'account-b';
  mocks.read.mockResolvedValue({
    data: settings('Asia/Tokyo', 0, 'account-b'),
    error: null,
  });
  hook.rerender();
  await waitFor(() =>
    expect(hook.result.current?.settings?.owner_id).toBe('account-b'),
  );
  await act(async () => {
    resolve({ data: settings('UTC', 1), error: null });
    await saving;
  });
  expect(getAccountTimezone()).toBe('Asia/Tokyo');
});
