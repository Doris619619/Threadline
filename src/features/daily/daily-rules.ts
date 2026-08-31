/** @fileoverview 集中定义 Daily 完成与实际耗时口径，避免首页、收尾和分析各自计算。 */

import type { Daily } from '@/features/daily/types';

/** 父级完成独立于子项，避免勾选子项后父 checkbox 无法取消的矛盾状态。 */
export function isDailyCompleted(daily: Pick<Daily, 'completed'>): boolean {
  return daily.completed;
}

/** Daily 的实际耗时是父级记录与每个子项 breakdown 之和。 */
export function getDailyActualMinutes(daily: Pick<Daily, 'actual' | 'children'>): number {
  return daily.actual + daily.children.reduce((total, child) => total + child.actual, 0);
}
