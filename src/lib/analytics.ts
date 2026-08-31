/**
 * @fileoverview 将任务、Daily 与旧收尾记录归一为可测试的 analytics 结果，供日历、洞察和报告共用。
 */

import { iterateLocalDateRange, type LocalDateRange } from '@/lib/date-range';
import type { CloseRecord, Project, Task, TaskTimeEntry } from '@/types/domain';

export type AnalyticsQuality = 'exact' | 'legacy-aggregate' | 'incomplete';
export type AnalyticsSource = 'task' | 'daily' | 'legacy-aggregate';

export type AnalyticsDailyItem = {
  id: string;
  projectId: string;
  title: string;
  actual: number;
  completed: boolean;
  children?: readonly { actual: number }[];
};

export type AnalyticsDailyHistoryEntry = {
  dailyId: string;
  projectId: string;
  date: string;
  completed: boolean;
  actual: number;
  result: string;
};

export type AnalyticsEntry = {
  id: string;
  date: string;
  projectId: string;
  actualMinutes: number;
  plannedMinutes: number;
  source: AnalyticsSource;
  quality: Exclude<AnalyticsQuality, 'incomplete'>;
  title?: string;
};

export type AnalyticsDay = {
  date: string;
  actualMinutes: number;
  plannedMinutes: number;
  taskActualMinutes: number;
  dailyActualMinutes: number;
  projectIds: string[];
  heatProjectCount: number;
  quality: AnalyticsQuality;
};

export type AnalyticsProject = {
  projectId: string;
  actualMinutes: number;
  plannedMinutes: number;
  quality: AnalyticsQuality;
};

export type AnalyticsResult = {
  range?: LocalDateRange;
  entries: AnalyticsEntry[];
  days: AnalyticsDay[];
  projects: AnalyticsProject[];
  totalActualMinutes: number;
  totalPlannedMinutes: number;
  incompleteCount: number;
};

export type AnalyticsInput = {
  tasks: readonly Task[];
  projects: readonly Project[];
  dailyByDate: Readonly<Record<string, readonly AnalyticsDailyItem[]>>;
  dailyHistory: readonly AnalyticsDailyHistoryEntry[];
  closeRecords: readonly CloseRecord[];
  /** 已迁移工作区提供 immutable 日粒度实际投入；缺省时兼容旧测试/旧快照。 */
  taskTimeEntries?: readonly TaskTimeEntry[];
  range?: LocalDateRange;
};

/** 判断日期是否落在当前分析范围内；未提供范围时保留所有可可靠记录。 */
function isInRange(date: string, range?: LocalDateRange): boolean {
  return !range || (date >= range.start && date <= range.end);
}

/** 将非负有限分钟值归一，损坏的旧持久化值不会污染汇总。 */
function safeMinutes(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

/** 用条目构建每个日期的统一口径；热力只统计 actual 大于零的去重项目。 */
function buildDays(
  entries: readonly AnalyticsEntry[],
  range?: LocalDateRange,
): AnalyticsDay[] {
  const dates = range
    ? iterateLocalDateRange(range)
    : [...new Set(entries.map((entry) => entry.date))].sort();
  return dates.map((date) => {
    const relevant = entries.filter((entry) => entry.date === date);
    const exact = relevant.some((entry) => entry.quality === 'exact');
    const legacy = relevant.some((entry) => entry.quality === 'legacy-aggregate');
    const projectIds = [
      ...new Set(
        relevant
          .filter((entry) => entry.actualMinutes > 0)
          .map((entry) => entry.projectId),
      ),
    ];
    return {
      date,
      actualMinutes: relevant.reduce((total, entry) => total + entry.actualMinutes, 0),
      plannedMinutes: relevant.reduce(
        (total, entry) => total + entry.plannedMinutes,
        0,
      ),
      taskActualMinutes: relevant
        .filter((entry) => entry.source === 'task')
        .reduce((total, entry) => total + entry.actualMinutes, 0),
      dailyActualMinutes: relevant
        .filter((entry) => entry.source === 'daily')
        .reduce((total, entry) => total + entry.actualMinutes, 0),
      projectIds,
      heatProjectCount: projectIds.length,
      quality: exact ? 'exact' : legacy ? 'legacy-aggregate' : 'incomplete',
    };
  });
}

/** 按项目汇总，并把 legacy aggregate 明确保留在数据质量中。 */
function buildProjects(entries: readonly AnalyticsEntry[]): AnalyticsProject[] {
  const ids = [...new Set(entries.map((entry) => entry.projectId))];
  return ids.map((projectId) => {
    const relevant = entries.filter((entry) => entry.projectId === projectId);
    const exact = relevant.some((entry) => entry.quality === 'exact');
    return {
      projectId,
      actualMinutes: relevant.reduce((total, entry) => total + entry.actualMinutes, 0),
      plannedMinutes: relevant.reduce(
        (total, entry) => total + entry.plannedMinutes,
        0,
      ),
      quality: exact ? 'exact' : 'legacy-aggregate',
    };
  });
}

/**
 * 建立统一分析结果。
 * 仅接纳来源自身明确给出日期与分钟的 task / Daily 记录；CloseRecord 只能作为项目级 legacy aggregate，
 * 并且同日同项目已有精确记录时完全跳过，绝不通过差额反推任务归属。
 */
export function createAnalyticsResult(input: AnalyticsInput): AnalyticsResult {
  const entries: AnalyticsEntry[] = [];
  let incompleteCount = 0;
  const exactDateProject = new Set<string>();
  const recordedDaily = new Set(
    input.dailyHistory.map((entry) => `${entry.dailyId}:${entry.date}`),
  );

  const timeEntries = input.taskTimeEntries;
  const authoritativeTaskTime = timeEntries !== undefined;
  const exactMinutesByTask = new Map<string, number>();
  for (const entry of timeEntries ?? []) {
    if (!entry.taskId) continue;
    exactMinutesByTask.set(
      entry.taskId,
      (exactMinutesByTask.get(entry.taskId) ?? 0) + safeMinutes(entry.minutes),
    );
  }
  for (const task of input.tasks) {
    const aggregateMinutes = safeMinutes(task.actualDurationMinutes);
    const exactMinutes = exactMinutesByTask.get(task.id) ?? 0;
    // 云端 ledger 即使为空也具有权威性；未归因 aggregate 只报告 incomplete，不再猜到当前日期。
    const actualMinutes = authoritativeTaskTime ? 0 : aggregateMinutes;
    const plannedMinutes = safeMinutes(task.plannedDurationMinutes);
    if (
      (authoritativeTaskTime && aggregateMinutes !== exactMinutes) ||
      (!authoritativeTaskTime && actualMinutes > 0 && !task.date)
    )
      incompleteCount += 1;
    if (!task.date || task.status === 'trashed' || !isInRange(task.date, input.range))
      continue;
    if (actualMinutes > 0 || plannedMinutes > 0) {
      entries.push({
        id: `task:${task.id}:${task.date}`,
        date: task.date,
        projectId: task.projectId,
        actualMinutes,
        plannedMinutes,
        source: 'task',
        quality: 'exact',
        title: task.title,
      });
      if (actualMinutes > 0) exactDateProject.add(`${task.date}:${task.projectId}`);
    }
  }

  for (const entry of timeEntries ?? []) {
    const actualMinutes = safeMinutes(entry.minutes);
    if (actualMinutes === 0 || !isInRange(entry.date, input.range)) continue;
    const task = input.tasks.find((item) => item.id === entry.taskId);
    entries.push({
      id: `task-time:${entry.id}`,
      date: entry.date,
      projectId: entry.projectId,
      actualMinutes,
      plannedMinutes: 0,
      source: 'task',
      quality: 'exact',
      title: task?.title,
    });
    exactDateProject.add(`${entry.date}:${entry.projectId}`);
  }

  for (const entry of input.dailyHistory) {
    const actualMinutes = safeMinutes(entry.actual);
    if (!isInRange(entry.date, input.range) || actualMinutes === 0) continue;
    entries.push({
      id: `daily-history:${entry.dailyId}:${entry.date}`,
      date: entry.date,
      projectId: entry.projectId,
      actualMinutes,
      plannedMinutes: 0,
      source: 'daily',
      quality: 'exact',
    });
    exactDateProject.add(`${entry.date}:${entry.projectId}`);
  }

  for (const [date, items] of Object.entries(input.dailyByDate)) {
    if (!isInRange(date, input.range)) continue;
    for (const item of items) {
      if (recordedDaily.has(`${item.id}:${date}`)) continue;
      const actualMinutes =
        safeMinutes(item.actual) +
        (item.children ?? []).reduce(
          (total, child) => total + safeMinutes(child.actual),
          0,
        );
      if (actualMinutes === 0) continue;
      entries.push({
        id: `daily-current:${item.id}:${date}`,
        date,
        projectId: item.projectId,
        actualMinutes,
        plannedMinutes: 0,
        source: 'daily',
        quality: 'exact',
        title: item.title,
      });
      exactDateProject.add(`${date}:${item.projectId}`);
    }
  }

  for (const record of input.closeRecords) {
    if (!isInRange(record.date, input.range)) continue;
    for (const [projectId, rawMinutes] of Object.entries(record.projectMinutes)) {
      const actualMinutes = safeMinutes(rawMinutes);
      if (actualMinutes === 0 || exactDateProject.has(`${record.date}:${projectId}`))
        continue;
      entries.push({
        id: `legacy-close:${record.id}:${projectId}`,
        date: record.date,
        projectId,
        actualMinutes,
        plannedMinutes: 0,
        source: 'legacy-aggregate',
        quality: 'legacy-aggregate',
      });
    }
  }

  const days = buildDays(entries, input.range);
  // 保留已删除项目的历史汇总；展示层再以“已删除项目”降级命名，不能静默丢失历史投入。
  const projects = buildProjects(entries).sort(
    (left, right) => right.actualMinutes - left.actualMinutes,
  );
  return {
    range: input.range,
    entries,
    days,
    projects,
    totalActualMinutes: entries.reduce(
      (total, entry) => total + entry.actualMinutes,
      0,
    ),
    totalPlannedMinutes: entries.reduce(
      (total, entry) => total + entry.plannedMinutes,
      0,
    ),
    incompleteCount,
  };
}
