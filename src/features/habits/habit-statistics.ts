/** @fileoverview 独立习惯统计：缺失不补零、按历史规则分档、跨午夜平均与完整业务日比较。 */
import { habitAddDays, habitMinutes, formatHabitMinutes } from './habit-time';
import type { HabitEntry, HabitRule, HabitKind } from './habit-types';

/** 按业务日期读取生效规则；启用前补录由初始规则覆盖。 */
export function habitRuleForDate(rules: HabitRule[], date: string): HabitRule {
  const rule = [...rules]
    .reverse()
    .sort(
      (a, b) =>
        b.effective_from.localeCompare(a.effective_from) ||
        b.created_at.localeCompare(a.created_at),
    )
    .find((item) => item.effective_from <= date);
  if (!rule) throw new Error('缺少习惯初始规则，请重试');
  return rule;
}
/** 使用记录引用的不可变规则，调整目标不追溯改写历史表现。 */
export function habitGrade(entry: HabitEntry, rules: HabitRule[]): string {
  if (entry.kind === 'efficiency')
    return ({ good: '好', medium: '中', poor: '差' } as const)[entry.efficiency!];
  const rule = rules.find((item) => item.id === entry.rule_id);
  if (!rule || !entry.local_time) return '已保存';
  const minutes = habitMinutes(entry.local_time, entry.business_date, entry.kind);
  if (entry.kind === 'wake') return minutes <= rule.wake_target ? '达标' : '未达标';
  return minutes <= rule.sleep_target
    ? '达标'
    : minutes < rule.sleep_late
      ? '稍晚'
      : minutes <= rule.sleep_very_late
        ? '较晚'
        : '很晚';
}
/** 只统计有效的已有记录，两项时间各用各自的分母。 */
export function summarizeHabits(
  entries: HabitEntry[],
  rules: HabitRule[],
  start: string,
  end: string,
  today: string,
) {
  const rows = entries.filter(
    (item) =>
      !item.deleted_at &&
      item.business_date >= start &&
      item.business_date <= end &&
      item.business_date <= today,
  );
  /** 时间均值按墙钟分钟展开，而不是平均 UTC 瞬间。 */
  const timeSummary = (kind: HabitKind) => {
    const matching = rows.filter((item) => item.kind === kind && item.local_time);
    const count = matching.length;
    const achieved = matching.filter(
      (item) => habitGrade(item, rules) === '达标',
    ).length;
    return {
      count,
      achieved,
      rate: count ? Math.round((100 * achieved) / count) : null,
      average: count
        ? matching.reduce(
            (sum, item) =>
              sum + habitMinutes(item.local_time!, item.business_date, kind),
            0,
          ) / count
        : null,
    };
  };
  return {
    sleep: timeSummary('sleep'),
    wake: timeSummary('wake'),
    efficiency: {
      count: rows.filter((item) => item.kind === 'efficiency').length,
      good: rows.filter((item) => item.efficiency === 'good').length,
      medium: rows.filter((item) => item.efficiency === 'medium').length,
      poor: rows.filter((item) => item.efficiency === 'poor').length,
    },
    mixedTimezones: new Set(rows.map((item) => item.timezone)).size > 1,
  };
}
/** 对比两个完整的 14 日窗口，每段至少七次记录才形成描述性结论。 */
export function habitRegularity(
  entries: HabitEntry[],
  rules: HabitRule[],
  businessToday: string,
  kind: 'sleep' | 'wake',
): string {
  const end = habitAddDays(businessToday, -1);
  const start = habitAddDays(end, -13);
  const previousEnd = habitAddDays(start, -1);
  const previousStart = habitAddDays(previousEnd, -13);
  const current = summarizeHabits(entries, rules, start, end, end)[kind];
  const previous = summarizeHabits(entries, rules, previousStart, previousEnd, end)[
    kind
  ];
  if (current.count < 7 || previous.count < 7)
    return '两个 14 日区间各记录至少 7 天后显示比较。';
  const difference = Math.round(current.average! - previous.average!);
  return `${start} 至 ${end} 平均${kind === 'sleep' ? '睡觉' : '起床'}时间 ${formatHabitMinutes(current.average!)}（${current.count} 次）；相比 ${previousStart} 至 ${previousEnd}（${previous.count} 次）${difference === 0 ? '持平' : `${difference > 0 ? '晚' : '早'} ${Math.abs(difference)} 分钟`}。`;
}
