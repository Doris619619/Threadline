/** @fileoverview 验证账号偏好完成约束、版本防倒退、实时刷新与账号切换异步隔离。 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  AccountPreferencesProvider,
  useAccountPreferences,
} from '@/features/onboarding/account-preferences-provider';
import {
  canShowRhythm,
  readAccountPreferences,
} from '@/features/onboarding/account-preferences';

const mocks = vi.hoisted(() => ({ read: vi.fn(), rpc: vi.fn(), owner: 'a' }));
vi.mock('@/features/auth/cloud-runtime-provider', () => ({
  useOptionalCloudRuntime: () => ({ user: { id: mocks.owner }, client }),
}));
const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
const client = {
  from: () => ({ select: () => ({ eq: () => ({ single: mocks.read }) }) }),
  rpc: mocks.rpc,
  channel: () => channel,
  removeChannel: vi.fn(),
};
/** 制作具有版本及账号归属的服务器偏好。 */
const profile = (
  gender: 'male' | 'female' | null = null,
  version = 0,
  owner = 'a',
) => ({
  owner_id: owner,
  gender,
  preferences_version: version,
  onboarding_completed_at: null,
});
beforeEach(() => {
  mocks.owner = 'a';
  mocks.read.mockResolvedValue({ data: profile(), error: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('requires explicit gender and rejects invalid completion or foreign account data', () => {
  expect(canShowRhythm(profile())).toBe(false);
  expect(canShowRhythm(profile('male'))).toBe(false);
  expect(canShowRhythm(profile('female'))).toBe(true);
  expect(() =>
    readAccountPreferences(
      { ...profile(), onboarding_completed_at: '2026-09-20T00:00:00Z' },
      'a',
    ),
  ).toThrow();
  expect(() => readAccountPreferences(profile(null, 0, 'b'), 'a')).toThrow();
});
it('accepts confirmed writes and ignores older focus responses', async () => {
  const hook = renderHook(useAccountPreferences, {
    wrapper: AccountPreferencesProvider,
  });
  await waitFor(() => expect(hook.result.current?.profile).not.toBeNull());
  mocks.rpc.mockResolvedValue({ data: [profile('male', 1)], error: null });
  await act(async () => {
    await hook.result.current!.save('male');
  });
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(hook.result.current?.profile?.gender).toBe('male');
});
it('retains confirmed data on failed writes and permits retry', async () => {
  const hook = renderHook(useAccountPreferences, {
    wrapper: AccountPreferencesProvider,
  });
  await waitFor(() => expect(hook.result.current?.profile).not.toBeNull());
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
  await act(async () => {
    await expect(hook.result.current!.save('male')).rejects.toThrow('timeout');
  });
  expect(hook.result.current?.profile?.gender).toBeNull();
  mocks.rpc.mockResolvedValue({ data: profile('male', 1), error: null });
  await act(async () => {
    await hook.result.current!.save('male');
  });
  expect(hook.result.current?.profile?.gender).toBe('male');
});
it('drops an old account save that completes after switching accounts', async () => {
  const hook = renderHook(useAccountPreferences, {
    wrapper: AccountPreferencesProvider,
  });
  await waitFor(() => expect(hook.result.current?.profile).not.toBeNull());
  let resolve!: (value: unknown) => void;
  mocks.rpc.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current!.save('male');
  });
  mocks.owner = 'b';
  mocks.read.mockResolvedValue({ data: profile('female', 3, 'b'), error: null });
  hook.rerender();
  await waitFor(() => expect(hook.result.current?.profile?.owner_id).toBe('b'));
  await act(async () => {
    resolve({ data: profile('male', 1), error: null });
    await pending;
  });
  expect(hook.result.current?.profile?.gender).toBe('female');
});
