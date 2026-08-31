/**
 * @fileoverview 回归 Daily 模板 RPC 的 entry/template item 稳定身份映射。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Daily } from '@/features/daily/types';
import { SupabaseWorkspaceRepository } from '@/lib/supabase/workspace-repository';

const baseDaily: Daily = {
  entryId: '10000000-0000-4000-8000-000000000001',
  id: '20000000-0000-4000-8000-000000000001',
  projectId: '30000000-0000-4000-8000-000000000001',
  project: '测试项目',
  color: '#2f80ed',
  title: '每日整理',
  actual: 20,
  result: '完成',
  completed: true,
  children: [
    {
      id: '40000000-0000-4000-8000-000000000001',
      title: '整理收件箱',
      completed: true,
      actual: 15,
    },
  ],
};

/** 创建只记录 RPC 参数的 Supabase client。 */
function createRpcClient() {
  const rpc = vi.fn(async () => ({ data: { id: baseDaily.id }, error: null }));
  return {
    rpc,
    client: { rpc } as unknown as SupabaseClient,
  };
}

describe('SupabaseWorkspaceRepository Daily template command', () => {
  it('reuses an entry item id as the stable template item mapping', async () => {
    const { client, rpc } = createRpcClient();
    const repository = new SupabaseWorkspaceRepository(client);

    await repository.updateDailyTemplate(baseDaily);

    expect(rpc).toHaveBeenCalledWith('update_daily_template_bundle', {
      p_template_id: baseDaily.id,
      p_entry_id: baseDaily.entryId,
      p_project_id: baseDaily.projectId,
      p_title: baseDaily.title,
      p_template_items: [
        {
          id: baseDaily.children[0].id,
          title: baseDaily.children[0].title,
          position: 0,
        },
      ],
      p_entry_items: [
        {
          id: baseDaily.children[0].id,
          template_item_id: baseDaily.children[0].id,
          title: baseDaily.children[0].title,
          position: 0,
          completed: true,
          actual: 15,
        },
      ],
    });
  });

  it('keeps an existing template item mapping unchanged', async () => {
    const { client, rpc } = createRpcClient();
    const repository = new SupabaseWorkspaceRepository(client);
    const templateItemId = '50000000-0000-4000-8000-000000000001';

    await repository.updateDailyTemplate({
      ...baseDaily,
      children: [{ ...baseDaily.children[0], templateItemId }],
    });

    const parameters = rpc.mock.calls[0][1];
    expect(parameters.p_template_items[0].id).toBe(templateItemId);
    expect(parameters.p_entry_items[0].template_item_id).toBe(templateItemId);
  });

  it('fails closed before RPC when an entry child has no stable id', async () => {
    const { client, rpc } = createRpcClient();
    const repository = new SupabaseWorkspaceRepository(client);

    await expect(
      repository.updateDailyTemplate({
        ...baseDaily,
        children: [{ ...baseDaily.children[0], id: undefined }],
      }),
    ).rejects.toThrow('update Daily template: child missing entry item id');
    expect(rpc).not.toHaveBeenCalled();
  });
});
