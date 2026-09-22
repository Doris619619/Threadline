/** @fileoverview 验证小页上限、完整提交、取消与游标异常不会造成静默数据丢失。 */
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllRows } from '@/lib/supabase/pagination';
/** 模拟 PostgREST 实际限制小于客户端请求大小的响应。 */
function server(count: number, cap = 500, failedPage = -1, repeat = false) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: String(i).padStart(6, '0'),
    position: count - i,
  }));
  let calls = 0;
  const client = {
    from: vi.fn(() => {
      let cursor = '';
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        gt: (_: string, value: string) => {
          cursor = repeat ? '' : value;
          return query;
        },
        abortSignal: () => query,
        then: (resolve: (value: unknown) => void) => {
          calls++;
          return Promise.resolve({
            data:
              calls === failedPage
                ? null
                : rows.filter((row) => row.id > cursor).slice(0, cap),
            error: calls === failedPage ? { message: 'offline' } : null,
          }).then(resolve);
        },
      };
      return query;
    }),
  };
  return { client: client as unknown as SupabaseClient, calls: () => calls };
}
describe('N01 complete cursor pagination', () => {
  it.each([0, 500, 1000, 1001, 1600])(
    'reads %i rows through the empty terminal page',
    async (count) => {
      const fixture = server(count);
      const result = await readAllRows(fixture.client, 'tasks', { sort: 'position' });
      expect(result).toHaveLength(count);
      expect(new Set(result.map((row) => row.id)).size).toBe(count);
      expect(fixture.calls()).toBe(Math.ceil(count / 500) + 1);
      if (count) expect(result[0].position).toBe(1);
    },
  );
  it('continues after a short page imposed by the server', async () => {
    const fixture = server(1001, 200);
    expect(await readAllRows(fixture.client, 'tasks')).toHaveLength(1001);
    expect(fixture.calls()).toBe(7);
  });
  it('does not return a partial collection after a failed middle page', async () => {
    const fixture = server(1600, 500, 2);
    await expect(readAllRows(fixture.client, 'tasks')).rejects.toThrow('offline');
  });
  it('rejects cancellation before issuing another read', async () => {
    const fixture = server(1000);
    const controller = new AbortController();
    controller.abort();
    await expect(
      readAllRows(fixture.client, 'tasks', { signal: controller.signal }),
    ).rejects.toThrow();
    expect(fixture.calls()).toBe(0);
  });
  it('rejects a repeated cursor rather than looping or duplicating data', async () => {
    const fixture = server(2, 500, -1, true);
    await expect(readAllRows(fixture.client, 'tasks')).rejects.toThrow('游标');
  });
});
