/** @fileoverview 用隔离 REST 响应确认阶段查询保留软删除版本，防止旧确认重现已删除阶段。 */
import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import { StagePlanRepository } from '@/features/stage-plans/repository';

it('reads active and deleted stage versions for cache ordering without losing exact timestamps', async () => {
  const rows = ['0001', '0002'].map((id, index) => ({
    id,
    name: '阶段' + id,
    start_date: '2026-10-01',
    end_date: '2026-10-08',
    home_visible: true,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00.123456+00:00',
    deleted_at: index ? '2026-10-01T00:00:01Z' : null,
  }));
  const client = createClient('https://stage.test.invalid', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      /** 模拟 REST 过滤与游标分页；不访问外部账号或网络。 */
      fetch: async (input) => {
        const url = new URL(String(input));
        const result = url.searchParams.has('id')
          ? []
          : url.searchParams.has('deleted_at')
            ? rows.filter((row) => !row.deleted_at)
            : rows;
        return new Response(JSON.stringify(result), {
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  });
  const plans = await new StagePlanRepository(client).list();
  expect(plans.map((plan) => plan.id)).toEqual(['0001', '0002']);
  expect(plans[1].deletedAt).toBe('2026-10-01T00:00:01Z');
  expect(plans[1].updatedAt).toBe('2026-10-01T00:00:00.123456+00:00');
});
