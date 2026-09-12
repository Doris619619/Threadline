/** @fileoverview 本地习惯事务契约：首次优先、批量原子、冲突、清除恢复和修订原始精度。 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyLocalHabitRequest,
  configureLocalHabits,
  emptyHabitData,
  mutateLocalHabits,
  readLocalHabits,
} from '@/features/habits/habit-local-repository';
import { DEFAULT_RULES, type HabitRequest } from '@/features/habits/habit-types';
const now = '2026-09-12T12:00:00Z';
/** 构造独立时区测试请求。 */
const command = (changes: HabitRequest['changes']): HabitRequest => ({
  changes,
  timezone: 'UTC',
  settingsVersion: 0,
  requestId: crypto.randomUUID(),
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe('habit transactions', () => {
  it('keeps first capture, retries idempotently and preserves immutable revisions', () => {
    const first = command([
      { mode: 'record', kind: 'wake', occurred_at: '2026-09-12T06:47:12.345Z' },
    ]);
    const data = applyLocalHabitRequest(emptyHabitData('UTC'), first, now);
    const retry = applyLocalHabitRequest(data, first, now);
    expect(retry.revisions).toHaveLength(1);
    const duplicate = applyLocalHabitRequest(
      data,
      command([{ mode: 'record', kind: 'wake', occurred_at: '2026-09-12T07:10:00Z' }]),
      now,
    );
    expect(duplicate.entries).toHaveLength(1);
    expect(duplicate.entries[0].occurred_at).toBe('2026-09-12T06:47:12.345Z');
    const edited = applyLocalHabitRequest(
      data,
      command([
        {
          mode: 'edit',
          kind: 'wake',
          id: data.entries[0].id,
          expected_version: 1,
          business_date: '2026-09-12',
          occurred_at: '2026-09-12T06:50:00Z',
        },
      ]),
      now,
    );
    expect(edited.entries[0].version).toBe(2);
    expect(edited.revisions[0].snapshot.occurred_at).toBe('2026-09-12T06:47:12.345Z');
    expect(applyLocalHabitRequest(edited, first, now).entries[0].version).toBe(2);
  });
  it('rejects stale versions, future times and invalid efficiency values', () => {
    const data = applyLocalHabitRequest(
      emptyHabitData('UTC'),
      command([
        { mode: 'record', kind: 'efficiency', efficiency: 'good', occurred_at: now },
      ]),
      now,
    );
    expect(() =>
      applyLocalHabitRequest(
        data,
        command([
          {
            mode: 'edit',
            kind: 'efficiency',
            id: data.entries[0].id,
            expected_version: 0,
            business_date: '2026-09-12',
            efficiency: 'poor',
          },
        ]),
        now,
      ),
    ).toThrow('其他设备');
    expect(() =>
      applyLocalHabitRequest(
        data,
        command([
          { mode: 'record', kind: 'wake', occurred_at: '2026-09-13T06:00:00Z' },
        ]),
        now,
      ),
    ).toThrow('未来');
    expect(() =>
      applyLocalHabitRequest(
        data,
        command([{ mode: 'edit', kind: 'efficiency', business_date: '2026-09-11' }]),
        now,
      ),
    ).toThrow('好、中或差');
  });
  it('rolls back all changes when one member fails, and clears/restores only one item', () => {
    const data = applyLocalHabitRequest(
      emptyHabitData('UTC'),
      command([{ mode: 'record', kind: 'wake', occurred_at: '2026-09-12T06:47:00Z' }]),
      now,
    );
    const id = data.entries[0].id;
    expect(() =>
      applyLocalHabitRequest(
        data,
        command([
          { mode: 'clear', kind: 'wake', id, expected_version: 1 },
          {
            mode: 'edit',
            kind: 'sleep',
            business_date: '2026-09-13',
            occurred_at: now,
          },
        ]),
        now,
      ),
    ).toThrow();
    expect(data.entries[0].deleted_at).toBeNull();
    const cleared = applyLocalHabitRequest(
      data,
      command([{ mode: 'clear', kind: 'wake', id, expected_version: 1 }]),
      now,
    );
    const restored = applyLocalHabitRequest(
      cleared,
      command([{ mode: 'restore', kind: 'wake', id, expected_version: 2 }]),
      now,
    );
    expect(restored.entries[0]).toMatchObject({
      version: 3,
      deleted_at: null,
      occurred_at: '2026-09-12T06:47:00Z',
    });
    expect(restored.revisions).toHaveLength(3);
  });
  it('allows a late morning bedtime to be explicitly attributed to the previous day', () => {
    const data = applyLocalHabitRequest(
      emptyHabitData('UTC'),
      command([
        {
          mode: 'edit',
          kind: 'sleep',
          business_date: '2026-09-11',
          occurred_at: '2026-09-12T04:30:00Z',
        },
      ]),
      now,
    );
    expect(data.entries[0].business_date).toBe('2026-09-11');
  });
  it('persists configuration once and rejects stale configuration writes', () => {
    const id = crypto.randomUUID();
    const initial = emptyHabitData('UTC');
    const data = configureLocalHabits(
      initial,
      'Asia/Shanghai',
      DEFAULT_RULES,
      0,
      id,
      now,
    );
    expect(
      configureLocalHabits(data, 'Asia/Shanghai', DEFAULT_RULES, 0, id, now).rules,
    ).toHaveLength(2);
    expect(() =>
      configureLocalHabits(data, 'UTC', DEFAULT_RULES, 0, crypto.randomUUID(), now),
    ).toThrow('其他设备');
  });
  it('reports storage failure without committing optimistic data', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await expect(
      mutateLocalHabits('UTC', (data) =>
        applyLocalHabitRequest(
          data,
          command([{ mode: 'record', kind: 'wake', occurred_at: now }]),
          now,
        ),
      ),
    ).rejects.toThrow('quota');
    expect(readLocalHabits('UTC').entries).toEqual([]);
  });
});
