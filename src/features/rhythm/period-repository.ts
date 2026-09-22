/** @fileoverview 生理期云端仓储，依赖 RLS 隔离账号，以软删除保留可追溯数据。 */
import { readAllRows } from '@/lib/supabase/pagination';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PeriodDraft, PeriodRecord } from './period-rules';

/** 将云端日期列映射到独立于工作台 analytics 的领域对象。 */
function mapPeriod(row: Record<string, unknown>): PeriodRecord {
  return {
    id: String(row.id),
    startDate: String(row.start_date),
    endDate: row.end_date ? String(row.end_date) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  };
}
/** 将数据库并发约束转为可恢复的表单错误，其他错误保持可诊断信息。 */
function checkError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === '23P01') throw new Error('日期与已有记录重叠，请刷新后修改');
  if (error.code === '23514')
    throw new Error('请检查日期：结束不能早于开始，也不能填写未来日期');
  throw new Error(`生理期记录保存或读取失败：${error.message}`);
}
/** 读取当前账号未删除的记录，所有数据隔离由 RLS 强制落实。 */
export async function listPeriods(
  client: SupabaseClient,
  signal?: AbortSignal,
): Promise<PeriodRecord[]> {
  return (
    await readAllRows(client, 'period_records', {
      signal,
      nullColumn: 'deleted_at',
      sort: 'start_date',
      descending: true,
    })
  ).map(mapPeriod);
}
/** 新建使用 insert，编辑使用 update，避免陈旧客户端将已删除记录重新插入。 */
export async function savePeriod(
  client: SupabaseClient,
  draft: PeriodDraft,
  existing: boolean,
): Promise<PeriodRecord> {
  const values = { start_date: draft.startDate, end_date: draft.endDate ?? null };
  const response = existing
    ? await client
        .from('period_records')
        .update(values)
        .eq('id', draft.id)
        .is('deleted_at', null)
        .select()
        .single()
    : await client
        .from('period_records')
        .insert({ id: draft.id, ...values })
        .select()
        .single();
  checkError(response.error);
  return mapPeriod(response.data!);
}
/** 软删除走 UPDATE，因此其他客户端可以通过 Realtime 及时刷新。 */
export async function deletePeriod(client: SupabaseClient, id: string): Promise<void> {
  const response = await client
    .from('period_records')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .single();
  checkError(response.error);
}
