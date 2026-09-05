/** @fileoverview 集中定义 Daily 完成与实际耗时口径，避免首页、收尾和分析各自计算。 */

import type { Daily } from '@/features/daily/types';

/** 直接打卡或任一子项完成都算当天完成，兼容旧实例尚未联动的父级状态。 */
export function isDailyCompleted(
  daily: Pick<Daily, 'completed'> & Partial<Pick<Daily, 'children'>>,
): boolean {
  return daily.completed || Boolean(daily.children?.some((child) => child.completed));
}

/** 父级取消撤销当天所有勾选，但保留耗时、结果和长期模板。 */
export function setDailyCompleted(daily: Daily, completed: boolean): Daily {
  return {
    ...daily,
    completed,
    children: completed
      ? daily.children
      : daily.children.map((child) => ({ ...child, completed: false })),
  };
}

/** 子项操作重新判定当天完成状态；取消最后一个子项会取消父级。 */
export function setDailyChildCompleted(
  daily: Daily,
  index: number,
  completed: boolean,
): Daily {
  const children = daily.children.map((child, childIndex) =>
    childIndex === index ? { ...child, completed } : child,
  );
  return { ...daily, children, completed: children.some((child) => child.completed) };
}

/** 预计耗时来自当天清单快照，首页不修改模板预计分钟。 */
export function getDailyPlannedMinutes(daily: Pick<Daily, 'children'>): number {
  return daily.children.reduce(
    (total, child) => total + (child.plannedDurationMinutes ?? 0),
    0,
  );
}

/** Daily 的实际耗时是父级记录与每个子项 breakdown 之和。 */
export function getDailyActualMinutes(
  daily: Pick<Daily, 'actual' | 'children'>,
): number {
  return (
    daily.actual + daily.children.reduce((total, child) => total + child.actual, 0)
  );
}
