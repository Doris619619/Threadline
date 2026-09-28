/** @fileoverview 两人空间查询、幂等写入与错误映射；生产错误不回退为演示数据。 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Command, CommandResult, Flag, Room, SpaceEvent } from './types';
export const spaceErrors: Record<string, string> = {
  INVITE_INVALID: '邀请码已过期、已使用或已撤销，请向对方索取新的邀请码。',
  INVITE_SELF: '不能接受自己发出的邀请。',
  ALREADY_BOUND: '你或对方已经绑定，请刷新查看。',
  NAME_REQUIRED: '请先填写空间展示名。',
  NAME_INVALID: '称呼需为 1–30 字，不能使用邮箱。',
  VERSION_CONFLICT:
    '内容刚刚发生变化，输入已保留。请关闭后重新打开，核对最新内容再提交。',
  ROOM_ENDED: '这段关系已结束，记录只读。',
  FORBIDDEN: '你没有执行此操作的权限。',
  SELF_REVIEW: '这一步需要对方来完成。',
  FLAG_LOCKED: '成果提交后，目标与约定不能修改。',
  INVALID_STATE: '状态已经变化，请刷新查看。',
  REASON_REQUIRED: '请填写需要补充的内容或惊喜说明。',
  WECHAT_REQUIRED: '请先通过微信发送成果，再确认提交。',
  REQUEST_REUSED: '请求内容已经变化，请重新打开后操作。',
  INVALID_RELATIONSHIP: '请选择好朋友或情侣，并请对方确认。',
};
/** 服务端明确回滚的写入可以修改后重交；网络未知结果仍需沿用原请求。 */
export class RejectedSpaceCommand extends Error {}
/** JSON 对象键顺序不影响同一意图比较，数组顺序仍然保留。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
/** 将数据库标识转为可操作提示，不向 UI 泄露 SQL 细节。 */
export function checkSpaceError(
  error: { message: string; code?: string } | null,
): void {
  if (!error) return;
  if (error.code === 'PGRST202' || error.code === '42P01' || error.code === 'PGRST205')
    throw new Error('功能暂未就绪，请等待两人空间服务部署完成。');
  for (const [marker, message] of Object.entries(spaceErrors))
    if (error.message.includes(marker)) throw new Error(message);
  if (error.code === '23505') throw new Error('这项操作已经完成，请刷新查看。');
  throw new Error('暂时无法完成操作，输入已保留，请检查网络后重试。');
}
/** 同一请求先查确认记录再发送；响应丢失后沿用 ID 查回原结果。 */
export async function executeCommand(
  client: SupabaseClient,
  user: string,
  command: Command,
): Promise<CommandResult> {
  /** 单次确认读取有时限；响应丢失后先查询相同请求，不能直接生成新请求。 */
  const confirm = async () =>
    client
      .from('together_requests')
      .select('input,result')
      .eq('actor', user)
      .eq('request_id', command.id)
      .abortSignal(AbortSignal.timeout(10000))
      .maybeSingle();
  const previous = await confirm();
  checkSpaceError(previous.error);
  if (previous.data) {
    if (
      canonical(previous.data.input) !==
      canonical({ action: command.action, payload: command.payload })
    )
      throw new Error(spaceErrors.REQUEST_REUSED);
    return previous.data.result as CommandResult;
  }
  const response = await client
    .rpc('together_command', {
      p_request_id: command.id,
      p_action: command.action,
      p_payload: command.payload,
    })
    .abortSignal(AbortSignal.timeout(20000));
  if (response.error) {
    // SQL 拒绝意味着整个事务已回滚，用户可以修正输入；传输失败则结果未知。
    if (/^(P0001|22|23|42501)/.test(response.error.code ?? '')) {
      try {
        checkSpaceError(response.error);
      } catch (error) {
        throw new RejectedSpaceCommand((error as Error).message);
      }
    }
    const confirmed = await confirm();
    if (!confirmed.error && confirmed.data) {
      if (
        canonical(confirmed.data.input) !==
        canonical({ action: command.action, payload: command.payload })
      )
        throw new Error(spaceErrors.REQUEST_REUSED);
      return confirmed.data.result as CommandResult;
    }
  }
  checkSpaceError(response.error);
  return response.data as CommandResult;
}
/** 空间元数据按 ID 分页，避免旧空间静默截断。 */
export async function readRooms(
  client: SupabaseClient,
  signal?: AbortSignal,
): Promise<Room[]> {
  const rows: Room[] = [];
  let cursor: string | undefined;
  for (;;) {
    let query = client.from('together_rooms').select('*').order('id').limit(100);
    if (cursor) query = query.gt('id', cursor);
    if (signal) query = query.abortSignal(signal);
    const response = await query;
    checkSpaceError(response.error);
    const page = response.data as Room[];
    if (!page.length) break;
    rows.push(...page);
    cursor = page.at(-1)!.id;
  }
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
/** 列表分页读取；进行中各分组独立排序查询，待我验收不会被后页隐藏。 */
export async function readFlags(
  client: SupabaseClient,
  room: string,
  user: string,
  mode: 'review' | 'mine' | 'theirs' | 'completed' | 'cancelled',
  page: number,
  signal?: AbortSignal,
): Promise<Flag[]> {
  let query = client.from('together_flags').select('*').eq('room_id', room);
  if (mode === 'review') query = query.eq('status', 'submitted').neq('owner_id', user);
  else if (mode === 'mine')
    query = query.in('status', ['active', 'submitted', 'changes']).eq('owner_id', user);
  else if (mode === 'theirs')
    query = query.in('status', ['active', 'changes']).neq('owner_id', user);
  else query = query.eq('status', mode);
  query = query
    .order(mode === 'completed' ? 'completed_at' : 'created_at', { ascending: false })
    .order('id')
    .range(page * 20, page * 20 + 19);
  if (signal) query = query.abortSignal(signal);
  const response = await query;
  checkSpaceError(response.error);
  return response.data as Flag[];
}
/** 详情记录使用游标完整读取，始终保留每次微信成果声明和验收过程。 */
export async function readEvents(
  client: SupabaseClient,
  flag: string,
  signal?: AbortSignal,
): Promise<SpaceEvent[]> {
  const events: SpaceEvent[] = [];
  let cursor: string | undefined;
  for (;;) {
    let query = client
      .from('together_events')
      .select('*')
      .eq('flag_id', flag)
      .order('id')
      .limit(100);
    if (cursor) query = query.gt('id', cursor);
    if (signal) query = query.abortSignal(signal);
    const response = await query;
    checkSpaceError(response.error);
    const page = response.data as SpaceEvent[];
    if (!page.length) break;
    events.push(...page);
    cursor = page.at(-1)!.id;
  }
  return events.sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}
