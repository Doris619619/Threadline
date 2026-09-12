/** @fileoverview 验证批量实时事件不会触发整个工作区重复读取，销毁后不再刷新。 */
import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { createWorkspaceRealtimeRefresh } from '@/features/workspace/workspace-realtime-refresh';
afterEach(() => vi.useRealTimers());

it('coalesces transaction events while preserving independent affected queries and account scope', () => {
  vi.useFakeTimers();
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const refresh = createWorkspaceRealtimeRefresh(client, 'account');
  for (let i = 0; i < 20; i++) {
    refresh.notify('tasks');
    refresh.notify('history_events');
    refresh.notify('workstation_entries');
  }
  expect(invalidate).not.toHaveBeenCalled();
  vi.advanceTimersByTime(40);
  expect(invalidate.mock.calls).toEqual(
    ['tasks', 'history', 'workstation'].map((key) => [
      { queryKey: ['workspace', 'account', key], exact: true },
    ]),
  );
  refresh.notify('daily_entries');
  refresh.dispose();
  vi.runAllTimers();
  expect(invalidate).toHaveBeenCalledTimes(3);
});
