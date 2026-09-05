/** @fileoverview 验证打印报告不把混合精确账本和旧版项目汇总误标为精确记录。 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReportDocument } from '@/features/insights/report-document';
import { buildReportData } from '@/features/insights/report-builder';
import { createAnalyticsResult } from '@/lib/analytics';

describe('ReportDocument', () => {
  it('renders mixed project input as a legacy aggregate rather than an exact record', () => {
    const result = createAnalyticsResult({
      tasks: [],
      taskTimeEntries: [
        {
          id: 'exact-ledger',
          taskId: 'task-1',
          projectId: 'research',
          date: '2026-08-20',
          minutes: 40,
        },
      ],
      projects: [],
      dailyByDate: {},
      dailyHistory: [],
      closeRecords: [
        {
          id: 'legacy-close',
          date: '2026-08-20',
          closedAt: '2026-08-20T20:00:00',
          projectMinutes: { research: 100 },
        },
      ],
    });
    const report = buildReportData({
      title: '混合数据质量报告',
      result,
      projectNames: new Map([['research', '科研']]),
    });

    render(<ReportDocument report={report} />);

    expect(screen.getByText('旧版项目汇总')).toBeVisible();
    expect(screen.queryByText('精确记录')).not.toBeInTheDocument();
    expect(screen.getByText('暂无足够数据')).toBeVisible();
  });
  it('compares paired estimates without changing ledger totals in the export', () => {
    const result = createAnalyticsResult({
      tasks: [],
      projects: [],
      dailyByDate: {},
      dailyHistory: [],
      closeRecords: [],
      taskTimeEntries: [
        {
          id: 'entry',
          taskId: 'task',
          projectId: 'project',
          date: '2026-08-20',
          minutes: 120,
        },
      ],
    });
    const report = buildReportData({
      title: '独立预计报告',
      result,
      projectNames: new Map(),
      estimateComparison: { pairedCount: 1, actual: 40, planned: 30 },
    });
    expect(report.totalActualMinutes).toBe(120);
    render(<ReportDocument report={report} />);
    expect(screen.getByText('比预计多 10 分钟')).toBeVisible();
  });
});
