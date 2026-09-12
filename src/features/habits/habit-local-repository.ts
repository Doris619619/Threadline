/** @fileoverview Preview/测试的事务式习惯仓储；单份快照原子持久化，修订与云端遵循相同契约。 */
import { workspaceStorageKey } from '@/lib/workspace-runtime';
import {
  DEFAULT_RULES,
  type HabitData,
  type HabitRequest,
  type HabitRevision,
  type HabitEntry,
  type RuleValues,
} from './habit-types';
import {
  habitBusinessDate,
  habitLocalTime,
  habitAddDays,
  validateHabitRules,
  validateHabitTimezone,
} from './habit-time';
import { habitRuleForDate } from './habit-statistics';

export type LocalHabitData = HabitData & {
  revisions: HabitRevision[];
  configurationRequests: string[];
};
export const HABIT_STORAGE_KEY = 'threadline.test.habits.v1';

/** 初始规则覆盖所有历史补录；只在首次成功保存时持久化，读取不产生写入。 */
export function emptyHabitData(timezone: string): LocalHabitData {
  validateHabitTimezone(timezone);
  return {
    settings: { owner_id: 'local', timezone, version: 0, updated_at: '' },
    rules: [
      {
        ...DEFAULT_RULES,
        id: '00000000-0000-0000-0000-000000000001',
        owner_id: 'local',
        effective_from: '0001-01-01',
        created_at: '',
      },
    ],
    entries: [],
    revisions: [],
    configurationRequests: [],
  };
}
/** 读取时不清理无效存储，防止损坏被误报为没有记录。 */
export function readLocalHabits(timezone: string): LocalHabitData {
  const raw = localStorage.getItem(workspaceStorageKey(HABIT_STORAGE_KEY));
  if (!raw) return emptyHabitData(timezone);
  const data = JSON.parse(raw) as LocalHabitData;
  if (
    !data.settings ||
    !Array.isArray(data.entries) ||
    !data.rules?.length ||
    !Array.isArray(data.revisions)
  )
    throw new Error('习惯存储无法读取，请检查本地数据后重试');
  return data;
}
/** 纯事务变换：任意一项冲突则整批不提交；相同请求返回当前记录而非旧快照。 */
export function applyLocalHabitRequest(
  current: LocalHabitData,
  request: HabitRequest,
  now: string,
): LocalHabitData {
  const data = structuredClone(current);
  if (!request.changes.length || request.changes.length > 3)
    throw new Error('每次须保存一至三项');
  if (data.revisions.some((item) => item.request_id === request.requestId)) return data;
  if (
    data.settings.version !== request.settingsVersion ||
    data.settings.timezone !== request.timezone
  )
    throw new Error('设置已在其他设备修改，请刷新后重试');
  for (const change of request.changes) {
    let entry = change.id
      ? data.entries.find((item) => item.id === change.id)
      : undefined;
    if (change.id && (!entry || entry.version !== change.expected_version))
      throw new Error('记录已在其他设备修改，请重新查看后再保存');
    if (entry && entry.kind !== change.kind) throw new Error('记录项目不匹配');
    if (entry && change.mode === 'record' && change.kind !== 'efficiency')
      throw new Error('已记录时间只能通过修改入口编辑');
    if (
      entry &&
      data.revisions.some(
        (item) => item.request_id === request.requestId && item.entry_id === entry!.id,
      )
    )
      throw new Error('同一项不能重复提交');
    if (change.mode === 'clear' || change.mode === 'restore') {
      if (!entry) throw new Error('记录不存在，请刷新');
      if (change.mode === 'restore' && !entry.deleted_at)
        throw new Error('记录已经恢复');
      entry.deleted_at = change.mode === 'clear' ? now : null;
      entry.version++;
      entry.updated_at = now;
    } else {
      if (entry?.deleted_at) throw new Error('记录已被清除，请先恢复');
      const timezone =
        change.mode === 'record'
          ? request.timezone
          : (change.timezone ?? entry?.timezone ?? request.timezone);
      validateHabitTimezone(timezone);
      const instant = change.occurred_at ?? now;
      if (
        !Number.isFinite(Date.parse(instant)) ||
        Date.parse(instant) > Date.parse(now) + 300_000
      )
        throw new Error('不能记录未来时间');
      const date =
        change.mode === 'record'
          ? habitBusinessDate(instant, timezone, change.kind)
          : change.business_date!;
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date > habitBusinessDate(now, timezone, 'wake')
      )
        throw new Error('不能填写未来日期');
      const local = habitLocalTime(instant, timezone);
      habitAddDays(date, 0);
      if (
        change.kind !== 'efficiency' &&
        (local.slice(0, 10) < date ||
          local.slice(0, 10) > habitAddDays(date, change.kind === 'sleep' ? 1 : 0))
      )
        throw new Error('起床须发生在当天，睡觉须发生在当天或次日');
      const duplicate = data.entries.find(
        (item) =>
          !item.deleted_at &&
          item.business_date === date &&
          item.kind === change.kind &&
          item.id !== entry?.id,
      );
      if (duplicate && change.mode === 'record' && change.kind !== 'efficiency') {
        data.revisions.push({
          entry_id: duplicate.id,
          request_id: request.requestId,
          snapshot: structuredClone(duplicate),
        });
        continue;
      }
      if (duplicate) throw new Error('该日期已有记录，请重新查看后修改');
      if (
        change.kind === 'efficiency' &&
        !['good', 'medium', 'poor'].includes(change.efficiency ?? '')
      )
        throw new Error('请选择好、中或差');
      const rule =
        entry && date === entry.business_date
          ? data.rules.find((item) => item.id === entry!.rule_id)!
          : habitRuleForDate(data.rules, date);
      const next: HabitEntry = {
        id: entry?.id ?? crypto.randomUUID(),
        owner_id: 'local',
        kind: change.kind,
        business_date: date,
        occurred_at: change.kind === 'efficiency' ? null : instant,
        local_time: change.kind === 'efficiency' ? null : local,
        timezone,
        efficiency: change.kind === 'efficiency' ? change.efficiency! : null,
        rule_id: rule.id,
        source: change.mode === 'record' ? 'automatic' : 'manual',
        version: (entry?.version ?? 0) + 1,
        created_at: entry?.created_at ?? now,
        updated_at: now,
        deleted_at: null,
      };
      data.entries = [...data.entries.filter((item) => item.id !== next.id), next];
      entry = next;
    }
    if (
      data.entries.some(
        (item) =>
          item.id !== entry!.id &&
          !item.deleted_at &&
          !entry!.deleted_at &&
          item.kind === entry!.kind &&
          item.business_date === entry!.business_date,
      )
    )
      throw new Error('该日期已有记录，不能恢复重复记录');
    data.revisions.push({
      entry_id: entry.id,
      request_id: request.requestId,
      snapshot: structuredClone(entry),
    });
  }
  return data;
}
/** 配置保存原子更新时区并新增次日规则；同一个请求重试不重复生成规则。 */
export function configureLocalHabits(
  data: LocalHabitData,
  timezone: string,
  rules: RuleValues,
  version: number,
  requestId: string,
  now: string,
): LocalHabitData {
  if (data.configurationRequests.includes(requestId)) return data;
  if (data.settings.version !== version)
    throw new Error('设置已在其他设备修改，请重新查看');
  validateHabitTimezone(timezone);
  validateHabitRules(rules);
  const result = structuredClone(data);
  const effective = habitAddDays(
    habitBusinessDate(now, data.settings.timezone, 'sleep'),
    1,
  );
  result.rules.push({
    ...rules,
    id: crypto.randomUUID(),
    owner_id: 'local',
    effective_from: effective,
    created_at: now,
  });
  result.settings = {
    owner_id: 'local',
    timezone,
    version: version + 1,
    updated_at: now,
  };
  result.configurationRequests.push(requestId);
  return result;
}
/** Web Locks 序列化多标签页的读改写；无该 API 时同步读取/写入保持同一事件循环原子性。 */
export async function mutateLocalHabits(
  timezone: string,
  operation: (data: LocalHabitData) => LocalHabitData,
): Promise<LocalHabitData> {
  const commit = () => {
    const next = operation(readLocalHabits(timezone));
    localStorage.setItem(workspaceStorageKey(HABIT_STORAGE_KEY), JSON.stringify(next));
    window.dispatchEvent(new Event('habits-changed'));
    return next;
  };
  return navigator.locks
    ? navigator.locks.request(workspaceStorageKey(HABIT_STORAGE_KEY), commit)
    : commit();
}
