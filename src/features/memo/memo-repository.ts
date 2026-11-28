/** @fileoverview 按账号和日期读写备忘录，云端使用版本检查 RPC，演示数据保持独立本机命名空间。 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { workspaceStorageKey } from '@/lib/workspace-runtime';
import { parseLocalDateKey } from '@/lib/local-date';
import {
  EMPTY_MEMO,
  parseMemoDocument,
  type MemoDocument,
  type MemoRecord,
} from './memo-document';

export class MemoConflictError extends Error {
  /** 并发冲突必须保留草稿并由用户选择版本，不能自动覆盖另一个设备。 */
  constructor() {
    super('另一处已更新这一天的备忘录。你的草稿已保留。');
  }
}

export interface MemoRepository {
  read(): Promise<MemoRecord>;
  save(content: MemoDocument, revision: number): Promise<MemoRecord>;
}

/** 映射云端 JSON 与版本；异常响应不当作不存在的记录。 */
function record(row: { content: unknown; revision: unknown }): MemoRecord {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new Error('备忘录版本无法读取，请重试。');
  return { content: parseMemoDocument(row.content), revision };
}

/** 将缺少迁移、网络失败和版本冲突转换成可以保留草稿的错误。 */
function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.message.includes('MEMO_CONFLICT')) throw new MemoConflictError();
  if (error.message.includes('MEMO_ACCOUNT_CHANGED'))
    throw new Error('登录账号已切换，草稿仍保留在原账号下。');
  if (['PGRST202', 'PGRST205', '42P01'].includes(error.code ?? ''))
    throw new Error('云端备忘录尚未启用，本机草稿已保留。');
  throw new Error('备忘录同步失败，请联网后重试。');
}

/** 创建固定账号/日期的仓储；日期切换后旧请求仍只能提交到原来的日期。 */
export function createCloudMemoRepository(
  client: SupabaseClient,
  owner: string,
  date: string,
): MemoRepository {
  parseLocalDateKey(date);
  return {
    /** 显式筛选账号与日期，RLS 在数据库侧再次校验账号。 */
    async read() {
      const response = await client
        .from('day_memos')
        .select('content, revision')
        .eq('owner_id', owner)
        .eq('memo_date', date)
        .abortSignal(AbortSignal.timeout(15_000))
        .maybeSingle();
      check(response.error);
      return response.data
        ? record(response.data)
        : { content: EMPTY_MEMO, revision: 0 };
    },
    /** 只有调用者读过的版本仍然有效才提交；清空也保存空文档，以防旧客户端恢复删除内容。 */
    async save(content, revision) {
      const response = await client
        .rpc('save_day_memo', {
          p_date: date,
          p_content: parseMemoDocument(content),
          p_expected_revision: revision,
          p_expected_owner: owner,
        })
        .abortSignal(AbortSignal.timeout(15_000));
      check(response.error);
      return record(response.data);
    },
  };
}

/** 本地适配器只用于显式测试/Preview；与云端实现使用相同版本冲突契约。 */
export function createLocalMemoRepository(date: string): MemoRepository {
  parseLocalDateKey(date);
  const key = workspaceStorageKey(`threadline.memo.local.v1:${date}`);
  /** 读取本日期记录；JSON 损坏直接报告，不删除原值。 */
  const read = async (): Promise<MemoRecord> => {
    const raw = localStorage.getItem(key);
    return raw ? record(JSON.parse(raw)) : { content: EMPTY_MEMO, revision: 0 };
  };
  return {
    read,
    /** 支持 Web Locks 时串行化跨标签演示写入；生产并发保护由数据库提供。 */
    async save(content, revision) {
      const commit = async () => {
        const current = await read();
        if (current.revision !== revision) throw new MemoConflictError();
        const next = { content: parseMemoDocument(content), revision: revision + 1 };
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      };
      return navigator.locks ? navigator.locks.request(key, commit) : commit();
    },
  };
}
