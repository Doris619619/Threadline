/** @fileoverview 习惯独立领域契约；数据库与 Preview 使用同一记录、规则和命令形状。 */
export type HabitKind = 'wake' | 'sleep' | 'efficiency';
export type Efficiency = 'good' | 'medium' | 'poor';
export type HabitSettings = {
  owner_id: string;
  timezone: string;
  version: number;
  updated_at: string;
};
export type HabitRule = {
  id: string;
  owner_id: string;
  effective_from: string;
  wake_target: number;
  sleep_target: number;
  sleep_late: number;
  sleep_very_late: number;
  created_at: string;
};
export type HabitEntry = {
  id: string;
  owner_id: string;
  business_date: string;
  kind: HabitKind;
  occurred_at: string | null;
  local_time: string | null;
  timezone: string;
  efficiency: Efficiency | null;
  rule_id: string;
  source: 'automatic' | 'manual';
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
export type HabitRevision = {
  entry_id: string;
  request_id: string;
  snapshot: HabitEntry;
};
export type HabitData = {
  settings: HabitSettings;
  rules: HabitRule[];
  entries: HabitEntry[];
};
export type HabitChange = {
  mode: 'record' | 'edit' | 'clear' | 'restore';
  kind: HabitKind;
  id?: string;
  expected_version?: number;
  business_date?: string;
  occurred_at?: string | null;
  timezone?: string;
  efficiency?: Efficiency | null;
};
export type HabitRequest = {
  requestId: string;
  changes: HabitChange[];
  timezone: string;
  settingsVersion: number;
};
export type RuleValues = Pick<
  HabitRule,
  'wake_target' | 'sleep_target' | 'sleep_late' | 'sleep_very_late'
>;
export const DEFAULT_RULES: RuleValues = {
  wake_target: 410,
  sleep_target: 1400,
  sleep_late: 1440,
  sleep_very_late: 1470,
};
export const KIND_LABELS: Record<HabitKind, string> = {
  wake: '起床',
  sleep: '睡觉',
  efficiency: '每日状态',
};
export const EFFICIENCY_LABELS: Record<Efficiency, string> = {
  good: '好',
  medium: '中',
  poor: '差',
};
