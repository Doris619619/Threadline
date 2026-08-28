/** @fileoverview 将共享 AnalyticsResult 转为可供浏览器与 Electron 共用的稳定报告数据。 */

import type { AnalyticsResult } from '@/lib/analytics';

/** 报告项目行保留数据质量，避免将旧版汇总展示成任务级精确历史。 */
export type ReportProjectRow = {
  projectId: string;
  projectName: string;
  actualMinutes: number;
  plannedMinutes: number;
  quality: 'exact' | 'legacy-aggregate' | 'incomplete';
};

/** 专用报告 DOM 的最小输入；它不依赖交互式 Insights 组件状态。 */
export type ReportData = {
  title: string;
  totalActualMinutes: number;
  totalPlannedMinutes: number;
  projects: readonly ReportProjectRow[];
  incompleteCount: number;
};

/** 从同一份 analytics 结果构建打印数据，使 Calendar、Insights 与 PDF 口径一致。 */
export function buildReportData({
  title,
  result,
  projectNames,
}: {
  title: string;
  result: AnalyticsResult;
  projectNames: ReadonlyMap<string, string>;
}): ReportData {
  return {
    title,
    totalActualMinutes: result.totalActualMinutes,
    totalPlannedMinutes: result.totalPlannedMinutes,
    incompleteCount: result.incompleteCount,
    projects: result.projects.map((project) => ({
      projectId: project.projectId,
      projectName: projectNames.get(project.projectId) ?? '已删除项目',
      actualMinutes: project.actualMinutes,
      plannedMinutes: project.plannedMinutes,
      quality: project.quality,
    })),
  };
}
