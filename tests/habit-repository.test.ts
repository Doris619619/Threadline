/** @fileoverview 云仓储边界：账号与范围过滤、分页、取消信号、RPC 参数及错误映射。 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, it, vi } from 'vitest';
import {
  checkHabitError,
  configureHabitAccount,
  listHabitData,
  saveHabitRequest,
} from '@/features/habits/habit-repository';
import { DEFAULT_RULES } from '@/features/habits/habit-types';

it('paginates without losing rows and scopes all reads to the account', async () => {
  const filters: unknown[][] = [];
  const ranges: unknown[][] = [];
  const aborts: AbortSignal[] = [];
  const signal = new AbortController().signal;
  const client = {
    from: (table: string) => {
      let offset = 0;
      const query = {
        select: () => query,
        order: () => query,
        eq: (...args: unknown[]) => {
          filters.push([table, ...args]);
          return query;
        },
        gte: (...args: unknown[]) => {
          filters.push([table, ...args]);
          return query;
        },
        lte: (...args: unknown[]) => {
          filters.push([table, ...args]);
          return query;
        },
        range: (start: number, end: number) => {
          offset = start;
          ranges.push([table, start, end]);
          return query;
        },
        abortSignal: (value: AbortSignal) => {
          aborts.push(value);
          return query;
        },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          resolve({
            data:
              table === 'habit_entries'
                ? Array.from({ length: offset === 0 ? 500 : 1 }, (_, i) => ({
                    id: String(offset + i),
                  }))
                : [],
            error: null,
          }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const data = await listHabitData(
    client,
    'account',
    'UTC',
    '2026-01-01',
    '2026-12-31',
    signal,
  );
  expect(data.entries).toHaveLength(501);
  expect(data.settings.owner_id).toBe('account');
  expect(data.rules[0].sleep_target).toBe(1400);
  expect(ranges).toContainEqual(['habit_entries', 500, 999]);
  expect(filters).toContainEqual(['habit_entries', 'business_date', '2026-01-01']);
  expect(filters.filter(([, key]) => key === 'owner_id')).toHaveLength(4);
  expect(aborts.every((value) => value === signal)).toBe(true);
});
it('sends stable operation identity and settings versions through RPC', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  const client = { rpc } as unknown as SupabaseClient;
  const request = {
    requestId: 'same',
    changes: [],
    settingsVersion: 3,
    timezone: 'UTC',
  };
  await saveHabitRequest(client, request);
  await configureHabitAccount(
    client,
    'Asia/Shanghai',
    'UTC',
    DEFAULT_RULES,
    3,
    'config',
  );
  expect(rpc.mock.calls[0]).toEqual([
    'apply_habit_entries',
    { p_request_id: 'same', p_changes: [], p_timezone: 'UTC', p_settings_version: 3 },
  ]);
  expect(rpc.mock.calls[1][1]).toMatchObject({
    p_expected_version: 3,
    p_initial_timezone: 'UTC',
    p_rules: DEFAULT_RULES,
  });
});
it('keeps failures distinct from an empty successful response', () => {
  expect(() => checkHabitError(null)).not.toThrow();
  expect(() => checkHabitError({ message: 'HABIT_CONFLICT_ENTRY' })).toThrow(
    '其他设备',
  );
  expect(() => checkHabitError({ message: 'duplicate', code: '23505' })).toThrow(
    '已有记录',
  );
  expect(() => checkHabitError({ message: 'HABIT_INVALID_DATE' })).toThrow('未来');
  expect(() => checkHabitError({ message: 'offline' })).toThrow('offline');
});
