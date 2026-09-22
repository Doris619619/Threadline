/** @fileoverview 使用真实时区 Provider 和启动聚合层验证可见失败重试与会话就绪边界。 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StartupProgressProvider } from '@/features/startup/startup-progress-context';
import { AccountTimezoneProvider } from '@/features/settings/account-timezone-provider';
import { useSessionReadiness } from '@/features/startup/use-session-readiness';
const fixture = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/features/auth/cloud-runtime-provider', () => ({
  useOptionalCloudRuntime: () => ({ user: { id: 'A' }, client }),
}));
const client = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: fixture.read }) }) }),
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  },
  removeChannel: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('K01 keeps a ready session available after background failure and resets on account change', () => {
  const hook = renderHook(({ owner, ready }) => useSessionReadiness(owner, ready), {
    initialProps: { owner: 'A', ready: false },
  });
  expect(hook.result.current).toBe(false);
  hook.rerender({ owner: 'A', ready: true });
  expect(hook.result.current).toBe(true);
  hook.rerender({ owner: 'A', ready: false });
  expect(hook.result.current).toBe(true);
  hook.rerender({ owner: 'B', ready: false });
  expect(hook.result.current).toBe(false);
});
it('K02 exposes the actual timezone error and retries the stage above the business tree', async () => {
  fixture.read
    .mockResolvedValueOnce({ error: { message: 'timezone offline' } })
    .mockResolvedValue({
      data: { owner_id: 'A', timezone: 'UTC', version: 0, updated_at: 'now' },
      error: null,
    });
  render(
    <StartupProgressProvider
      active
      authentication={{ status: 'completed' }}
      workspaceInitialization={{ status: 'completed' }}
    >
      <AccountTimezoneProvider>
        <p>business tree</p>
      </AccountTimezoneProvider>
    </StartupProgressProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getAllByRole('alert').some((item) => item.closest('.threadline-startup')),
    ).toBe(true),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: '重新加载' })),
  );
  await waitFor(() => expect(screen.getByText('business tree')).toBeInTheDocument());
  expect(fixture.read).toHaveBeenCalledTimes(2);
});
