/** @fileoverview 洞察页：使用共享 analytics 展示范围内的投入、估时偏差、趋势与项目重心。 */

'use client';

import { Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Surface } from '@/components/ui/surface';
import { getMainDesktopBridge } from '@/lib/desktop-bridge';
import { type AnalyticsInput, createAnalyticsResult } from '@/lib/analytics';
import { ReportDocument } from './report-document';
import { buildReportData } from './report-builder';
import {
  createLocalDateRange,
  getPreviousEqualLengthRange,
  getPresetDateRange,
  type DateRangePreset,
} from '@/lib/date-range';

/** 将分钟转为面向工作台的可读文本。 */
function formatMinutes(minutes: number): string {
  return minutes < 60
    ? `${minutes} 分钟`
    : `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}`;
}

/** 将范围内总偏差转为描述性文本，不把少用时间误称为效率提升。 */
function formatDeviation(actual: number, planned: number): string {
  if (planned === 0) return '暂无预计时长';
  const difference = actual - planned;
  return difference === 0
    ? '与预计一致'
    : difference > 0
      ? `比预计多 ${formatMinutes(difference)}`
      : `比预计少 ${formatMinutes(-difference)}`;
}

/** 渲染可切换范围的洞察和浏览器打印入口。 */
export function InsightsPanel({
  analyticsInput,
  selectedDate,
}: {
  analyticsInput: Omit<AnalyticsInput, 'range'>;
  selectedDate: string;
}) {
  const [preset, setPreset] = useState<DateRangePreset>('week');
  const [customStart, setCustomStart] = useState(selectedDate);
  const [customEnd, setCustomEnd] = useState(selectedDate);
  const range = useMemo(
    () =>
      preset === 'custom'
        ? createLocalDateRange(customStart, customEnd)
        : getPresetDateRange(preset, selectedDate),
    [customEnd, customStart, preset, selectedDate],
  );
  const result = useMemo(
    () => createAnalyticsResult({ ...analyticsInput, range }),
    [analyticsInput, range],
  );
  const projectNames = useMemo(
    () => new Map(analyticsInput.projects.map((project) => [project.id, project.name])),
    [analyticsInput.projects],
  );
  const title = `${range.start} 至 ${range.end}`;
  const report = useMemo(
    () => buildReportData({ title, result, projectNames }),
    [projectNames, result, title],
  );
  const trendData = result.days.map((day) => ({
    date: day.date.slice(5),
    actual: day.actualMinutes,
    planned: day.plannedMinutes,
  }));
  const distributionData = result.projects.map((project) => ({
    name: projectNames.get(project.projectId) ?? '已删除项目',
    minutes: project.actualMinutes,
  }));
  const previous = createAnalyticsResult({
    ...analyticsInput,
    range: getPreviousEqualLengthRange(range),
  });
  const focusChanged =
    result.projects[0]?.projectId !== previous.projects[0]?.projectId;
  /** Electron 由 Main 输出当前报告 DOM；Web/PWA 保留浏览器原生打印流程。 */
  const exportReport = async () => {
    const bridge = getMainDesktopBridge();
    if (bridge) {
      await bridge.exportReportPdf();
      return;
    }
    window.print();
  };

  return (
    <div className="insights-panel" data-testid="insights-panel">
      <header className="insights-toolbar">
        <div className="insights-filters" aria-label="洞察范围">
          {(['day', 'week', 'month', 'custom'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={preset === value ? 'is-active' : ''}
              onClick={() => setPreset(value)}
            >
              {{ day: '当天', week: '本周', month: '本月', custom: '自定义' }[value]}
            </button>
          ))}
          {preset === 'custom' && (
            <>
              <label>
                开始
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                />
              </label>
              <label>
                结束
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <div className="insights-actions">
          <button
            type="button"
            className="tl-button tl-button--secondary"
            onClick={() => void exportReport()}
          >
            <Printer size={16} aria-hidden="true" /> 导出报告
          </button>
        </div>
      </header>
      <div className="insights-summary">
        <Surface>
          <span>实际投入</span>
          <strong>{formatMinutes(result.totalActualMinutes)}</strong>
          <small>任务与 Daily 的已记录实际时长</small>
        </Surface>
        <Surface>
          <span>预计 vs 实际</span>
          <strong>
            {formatDeviation(result.totalActualMinutes, result.totalPlannedMinutes)}
          </strong>
          <small>不将差异解释为效率</small>
        </Surface>
        <Surface>
          <span>项目重心</span>
          <strong>
            {projectNames.get(result.projects[0]?.projectId ?? '') ?? '暂无数据'}
          </strong>
          <small>
            {focusChanged ? '较比较周期发生变化' : '与比较周期一致或暂无对照'}
          </small>
        </Surface>
      </div>
      <div className="insights-charts">
        <Surface className="insight-chart">
          <header>
            <h3>工作投入趋势</h3>
            <span>{title}</span>
          </header>
          {trendData.some((item) => item.actual || item.planned) ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis unit="m" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="实际"
                  stroke="var(--accent)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="planned"
                  name="预计"
                  stroke="var(--text-tertiary)"
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-copy">填写实际或预计时长后，这里会显示趋势。</p>
          )}
        </Surface>
        <Surface className="insight-chart">
          <header>
            <h3>项目时间分布</h3>
            <span>实际投入</span>
          </header>
          {distributionData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={distributionData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" unit="m" />
                <YAxis dataKey="name" type="category" width={72} />
                <Tooltip />
                <Bar
                  dataKey="minutes"
                  name="实际投入"
                  fill="var(--success)"
                  radius={[4, 4, 4, 4]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-copy">本范围尚无可可靠汇总的项目投入。</p>
          )}
        </Surface>
      </div>
      <ReportDocument report={report} />
    </div>
  );
}
