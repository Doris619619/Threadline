/** @fileoverview 验证 Daily 模板写入不携带项目，并在一个 RPC payload 中原子提交计划清单。 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Daily } from '@/features/daily/types';
import { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';

const daily: Daily = {
  id: '20000000-0000-4000-8000-000000000001',
  title: '每日整理',
  actual: 0,
  result: '',
  completed: false,
  children: [
    {
      templateItemId: '40000000-0000-4000-8000-000000000001',
      title: '整理收件箱',
      plannedDurationMinutes: 30,
      completed: false,
      actual: 0,
    },
  ],
};

/** 构造只记录 RPC 参数的 repository client。 */
function client() {
  const rpc = vi.fn(async () => ({ data: { id: daily.id }, error: null }));
  return { rpc, client: { rpc } as unknown as SupabaseClient };
}

describe('SupabaseWorkspaceRepository Daily template command', () => {
  it('sends only template identity, title and planned items when updating a Daily', async () => {
    const fixture = client();
    const repository = new SupabaseWorkspaceRepository(fixture.client);
    await repository.updateDailyTemplate(daily);
    expect(fixture.rpc).toHaveBeenCalledWith('update_daily_template_bundle', {
      p_template_id: daily.id,
      p_title: daily.title,
      p_items: [
        {
          id: daily.children[0].templateItemId,
          title: '整理收件箱',
          position: 0,
          planned_duration_minutes: 30,
        },
      ],
    });
  });

  it('creates a Daily and all checklist items through one atomic RPC', async () => {
    const fixture = client();
    const repository = new SupabaseWorkspaceRepository(fixture.client);
    await repository.createDailyTemplate(daily, '2026-09-01');
    expect(fixture.rpc).toHaveBeenCalledWith(
      'create_daily_template_with_entry',
      expect.objectContaining({
        p_template_id: daily.id,
        p_title: daily.title,
        p_entry_date: '2026-09-01',
        p_items: [
          expect.objectContaining({
            title: '整理收件箱',
            planned_duration_minutes: 30,
          }),
        ],
      }),
    );
  });

  it('excludes deleted children but retains archived children in the template RPC payload', async () => {
    const fixture = client();
    const repository = new SupabaseWorkspaceRepository(fixture.client);
    await repository.updateDailyTemplate({
      ...daily,
      children: [
        daily.children[0],
        {
          templateItemId: '40000000-0000-4000-8000-000000000002',
          title: '已归档但仍保留',
          plannedDurationMinutes: 20,
          active: false,
          completed: false,
          actual: 0,
        },
        {
          templateItemId: '40000000-0000-4000-8000-000000000003',
          title: '已删除且不得回写',
          plannedDurationMinutes: 15,
          deletedAt: '2026-09-02T00:00:00.000Z',
          completed: false,
          actual: 0,
        },
      ],
    });
    expect(fixture.rpc).toHaveBeenCalledWith('update_daily_template_bundle', {
      p_template_id: daily.id,
      p_title: daily.title,
      p_items: [
        expect.objectContaining({ id: daily.children[0].templateItemId }),
        expect.objectContaining({
          id: '40000000-0000-4000-8000-000000000002',
        }),
      ],
    });
  });
});
