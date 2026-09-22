/** @fileoverview 按不可变唯一 ID 分页，只有完整读取成功才向调用方交付集合。 */
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

/** 不依赖服务端页长；拒绝重复或倒退游标，取消时不返回不完整数据。 */
export async function readAllRows(
  client: SupabaseClient,
  table: string,
  options: {
    signal?: AbortSignal;
    nullColumn?: string;
    ids?: string[];
    owner?: string;
    range?: { column: string; start: string; end: string };
    sort?: string;
    descending?: boolean;
  } = {},
): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | undefined;
  for (;;) {
    options.signal?.throwIfAborted();
    let query = client.from(table).select('*').order('id').limit(500);
    if (options.range)
      query = query
        .gte(options.range.column, options.range.start)
        .lte(options.range.column, options.range.end);
    if (cursor) query = query.gt('id', cursor);
    if (options.nullColumn) query = query.is(options.nullColumn, null);
    if (options.ids) query = query.in('id', options.ids);
    if (options.owner) query = query.eq('owner_id', options.owner);
    if (options.signal) query = query.abortSignal(options.signal);
    const { data, error } = await query;
    options.signal?.throwIfAborted();
    if (error) throw new Error(`读取 ${table} 失败：${error.message}`);
    if (!data) throw new Error(`读取 ${table} 未返回集合`);
    if (!data.length) break;
    for (const row of data as Row[]) {
      const id = String(row.id ?? '');
      if (!id || (cursor !== undefined && id <= cursor))
        throw new Error(`读取 ${table} 时分页游标未前进`);
      cursor = id;
      rows.push(row);
    }
  }
  if (options.sort) {
    const key = options.sort;
    rows.sort((a, b) => {
      const left = a[key];
      const right = b[key];
      const order =
        left == null
          ? right == null
            ? 0
            : 1
          : right == null
            ? -1
            : left < right
              ? -1
              : left > right
                ? 1
                : 0;
      return (
        (options.descending ? -order : order) ||
        String(a.id).localeCompare(String(b.id))
      );
    });
  }
  return rows;
}
