/** @fileoverview 验证 Preview 生理期加载、存储失败重试与旧日期标记保留。 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLocalPeriodState } from '@/features/rhythm/use-local-period-state';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('local period persistence', () => {
  it('keeps legacy marks and waits for storage success before showing a new record', async () => {
    localStorage.setItem(
      'threadline.test.rhythm.v1',
      JSON.stringify({ '2026-01-01': true }),
    );
    const { result } = renderHook(() => useLocalPeriodState());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const draft = { id: 'record', startDate: '2026-01-02', endDate: '2026-01-03' };
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });
    await act(async () => {
      await expect(result.current.save(draft)).rejects.toThrow('输入已保留');
    });
    expect(result.current.periods).toEqual([]);
    write.mockRestore();
    await act(async () => {
      await result.current.save(draft);
    });
    expect(result.current.periods).toHaveLength(1);
    expect(result.current.marks).toEqual({ '2026-01-01': true });
    await act(async () => {
      await result.current.remove(draft.id);
    });
    expect(result.current.periods).toHaveLength(0);
    expect(
      JSON.parse(localStorage.getItem('threadline.test.periods.v1')!)[0].deletedAt,
    ).toBeTruthy();
    await act(async () => {
      await expect(result.current.save(draft)).rejects.toThrow('已被删除');
    });
  });

  it('shows read failures and allows retry instead of silently using empty data', async () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const { result } = renderHook(() => useLocalPeriodState());
    await waitFor(() => expect(result.current.error).toContain('读取'));
    read.mockRestore();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeUndefined();
  });
});
