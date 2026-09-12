/** @fileoverview 习惯 Supabase 仓储：范围读取、RPC 写入与可恢复错误，不进入任务仓储。 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HabitData,
  HabitEntry,
  HabitRequest,
  HabitRule,
  HabitSettings,
  RuleValues,
} from './habit-types';
import { emptyHabitData } from './habit-local-repository';

/** 将数据库约束转换为用户可恢复的失败；保留其他错误的诊断信息。 */
export function checkHabitError(
  error: { message: string; code?: string } | null,
): void {
  if (!error) return;
  if (error.message.includes('HABIT_CONFLICT'))
    throw new Error('记录或设置已在其他设备修改，请重新查看后再保存');
  if (error.code === '23505') throw new Error('该日期已有记录，请重新查看后修改');
  if (error.message.includes('HABIT_INVALID'))
    throw new Error('请检查日期、时区和时间分界，不能填写未来记录');
  throw new Error(`习惯数据操作失败：${error.message}`);
}
/** 读取账号配置及选定范围，显式分页避免 PostgREST 默认行数截断。 */
export async function listHabitData(
  client: SupabaseClient,
  owner: string,
  timezone: string,
  start: string,
  end: string,
  signal?: AbortSignal,
  knownIds: string[] = [],
): Promise<HabitData> {
  const settingsQuery = client.from('habit_settings').select('*').eq('owner_id', owner);
  if (signal) settingsQuery.abortSignal(signal);
  const settingsResult = await settingsQuery.maybeSingle();
  checkHabitError(settingsResult.error);
  const rules: HabitRule[] = [];
  const entries: HabitEntry[] = [];
  for (const table of ['habit_rule_versions', 'habit_entries'] as const) {
    for (let offset = 0; ; offset += 500) {
      let query = client
        .from(table)
        .select('*')
        .eq('owner_id', owner)
        .order('id')
        .range(offset, offset + 499);
      if (table === 'habit_entries')
        query = query.gte('business_date', start).lte('business_date', end);
      if (signal) query = query.abortSignal(signal);
      const result = await query;
      checkHabitError(result.error);
      if (table === 'habit_entries') entries.push(...(result.data as HabitEntry[]));
      else rules.push(...(result.data as HabitRule[]));
      if (result.data!.length < 500) break;
    }
  }
  // 其他设备可能把记录移出范围；按身份补查，防止单调缓存留下原日期的幽灵记录。
  const returnedIds = new Set(entries.map((entry) => entry.id));
  const missingIds = [...new Set(knownIds)].filter((id) => !returnedIds.has(id));
  for (let offset = 0; offset < missingIds.length; offset += 100) {
    const query = client
      .from('habit_entries')
      .select('*')
      .eq('owner_id', owner)
      .in('id', missingIds.slice(offset, offset + 100));
    if (signal) query.abortSignal(signal);
    const result = await query;
    checkHabitError(result.error);
    entries.push(...(result.data as HabitEntry[]));
  }
  const fallback = emptyHabitData(timezone);
  return {
    settings: (settingsResult.data as HabitSettings | null) ?? {
      ...fallback.settings,
      owner_id: owner,
    },
    rules: rules.length ? rules : fallback.rules,
    entries,
  };
}
/** 稳定请求 ID 贯穿超时重试，数据库返回当前版本避免重新应用旧请求。 */
export async function saveHabitRequest(
  client: SupabaseClient,
  request: HabitRequest,
): Promise<HabitEntry[]> {
  const result = await client.rpc('apply_habit_entries', {
    p_request_id: request.requestId,
    p_changes: request.changes,
    p_timezone: request.timezone,
    p_settings_version: request.settingsVersion,
  });
  checkHabitError(result.error);
  return result.data as HabitEntry[];
}
/** 时区立即生效，规则由数据库按原账号业务日计算次日生效日期。 */
export async function configureHabitAccount(
  client: SupabaseClient,
  timezone: string,
  initialTimezone: string,
  rules: RuleValues,
  version: number,
  requestId: string,
): Promise<HabitSettings> {
  const result = await client.rpc('configure_habits', {
    p_timezone: timezone,
    p_initial_timezone: initialTimezone,
    p_rules: rules,
    p_expected_version: version,
    p_request_id: requestId,
  });
  checkHabitError(result.error);
  return result.data as HabitSettings;
}
