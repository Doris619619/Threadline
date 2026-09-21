/** @fileoverview 验证云端生理期在 React Query 离线模式下立即报告错误，并可恢复加载。 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RhythmStateProvider, useRhythmState } from '@/features/rhythm/rhythm-state';

const mocks = vi.hoisted(() => ({
  visible: true,
  removeChannel: vi.fn(),
  listPeriods: vi.fn(
    async (): Promise<import('@/features/rhythm/period-rules').PeriodRecord[]> => [],
  ),
  savePeriod: vi.fn(),
  deletePeriod: vi.fn(),
  listRhythmMarks: vi.fn(async () => ({})),
}));
vi.mock('@/lib/workspace-runtime', () => ({ usesLocalWorkspace: () => false }));
vi.mock('@/features/onboarding/account-preferences-provider', () => ({
  useRhythmVisible: () => mocks.visible,
}));
vi.mock('@/features/rhythm/period-repository', () => mocks);
vi.mock('@/features/auth/cloud-runtime-provider', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn() };
  const runtime = {
    user: { id: 'account' },
    repository: mocks,
    client: { channel: () => channel, removeChannel: mocks.removeChannel },
  };
  return { useCloudRuntime: () => runtime };
});

/** 独立查询缓存不重试，便于观察离线暂停与表单错误的真实区别。 */
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useRhythmState(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <RhythmStateProvider>{children}</RhythmStateProvider>
      </QueryClientProvider>
    ),
  });
}
afterEach(() => {
  mocks.visible = true;
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('cloud period offline recovery', () => {
  it('does not query male profiles and stops subscriptions without remounting consumers', async () => {
    mocks.visible = false;
    const hook = setup();
    expect(mocks.listPeriods).not.toHaveBeenCalled();
    expect(mocks.listRhythmMarks).not.toHaveBeenCalled();
    mocks.visible = true;
    hook.rerender();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(mocks.listPeriods).toHaveBeenCalledOnce();
    mocks.visible = false;
    hook.rerender();
    await waitFor(() => expect(mocks.removeChannel).toHaveBeenCalled());
    await act(async () => {
      await expect(
        hook.result.current.save({ id: 'p', startDate: '2026-01-02' }),
      ).rejects.toThrow('未启用');
    });
  });
  it('rejects save immediately even when React Query sees the browser as offline', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    onlineManager.setOnline(false);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => {
      await expect(
        result.current.save({ id: 'period', startDate: '2026-01-02' }),
      ).rejects.toThrow('离线');
    });
    expect(mocks.savePeriod).not.toHaveBeenCalled();
  });
  it('shows an offline load error and can retry when the network returns', async () => {
    onlineManager.setOnline(false);
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = setup();
    await waitFor(() => expect(result.current.error).toContain('离线'));
    online.mockReturnValue(true);
    act(() => {
      onlineManager.setOnline(true);
      result.current.retry();
    });
    await waitFor(() => expect(result.current.error).toBeUndefined());
    expect(mocks.listPeriods).toHaveBeenCalled();
  });
});

it('finishes a confirmed period save without waiting for another list request', async () => {
  const saved = {
    id: 'period',
    startDate: '2026-01-02',
    createdAt: '2026-01-02',
    updatedAt: '2026-01-02',
  };
  mocks.savePeriod.mockResolvedValueOnce(saved);
  const { result } = setup();
  await waitFor(() => expect(result.current.loading).toBe(false));
  const reads = mocks.listPeriods.mock.calls.length;
  mocks.listPeriods.mockImplementationOnce(() => new Promise(() => {}));
  await act(async () =>
    result.current.save({ id: saved.id, startDate: saved.startDate }),
  );
  await waitFor(() => expect(result.current.periods).toEqual([saved]));
  expect(mocks.listPeriods).toHaveBeenCalledTimes(reads);
});
