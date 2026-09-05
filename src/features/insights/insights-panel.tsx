/** @fileoverview 洞察页：使用共享 analytics 展示范围内的投入、估时偏差、趋势与项目重心。 */

'use client';

import { Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Surface } from '@/components/ui/surface';
import { getMainDesktopBridge } from '@/lib/desktop-bridge';
import { type AnalyticsInput, createAnalyticsResult } from '@/lib/analytics';
import { buildInsightSummary } from './insight-summary';
import { ReportDocument } from './report-document';
import { buildReportData } from './report-builder';
import {
  createLocalDateRange,
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
  const summary = useMemo(
    () => buildInsightSummary({ ...analyticsInput, range }),
    [analyticsInput, range],
  );
  const title = `${range.start} 至 ${range.end}`;
  const report = useMemo(
    () => buildReportData({ title, result, projectNames, estimateComparison: summary }),
    [projectNames, result, title, summary],
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
  const projectTotal = distributionData.reduce((sum, item) => sum + item.minutes, 0);
  const mainProject = result.projects.find((project) => project.actualMinutes > 0);
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
              aria-pressed={preset === value}
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
                  required
                  value={customStart}
                  onChange={(event) =>
                    event.target.value && setCustomStart(event.target.value)
                  }
                />
              </label>
              <label>
                结束
                <input
                  type="date"
                  required
                  value={customEnd}
                  onChange={(event) =>
                    event.target.value && setCustomEnd(event.target.value)
                  }
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
      <p className="insights-range-label">{title}</p>
      <div className="insights-summary">
        <Surface className="insight-primary">
          <span>实际投入</span>
          <strong>{formatMinutes(result.totalActualMinutes)}</strong>
          <small>任务与 Daily 已记录的时间</small>
        </Surface>
        <Surface>
          <span>普通任务完成</span>
          <strong>
            {summary.total ? `${summary.completed} / ${summary.total}` : '暂无任务'}
          </strong>
          <small>当前范围内的日程任务</small>
        </Surface>
        <Surface>
          <span>主要投入项目</span>
          <strong>
            {mainProject
              ? (projectNames.get(mainProject.projectId) ?? '已删除项目')
              : '暂无记录'}
          </strong>
          <small>
            {mainProject
              ? formatMinutes(mainProject.actualMinutes)
              : '记录实际耗时后显示'}
          </small>
        </Surface>
      </div>
      <div className="insights-charts">
        <Surface className="insight-chart">
          <header>
            <h2>每日投入</h2>
            <span>实际时间</span>
          </header>
          {trendData.some((item) => item.actual) ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  />
                  <YAxis
                    width={42}
                    unit="m"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => formatMinutes(Number(value))}
                    contentStyle={{
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      borderColor: 'var(--border)',
                    }}
                  />
                  <Bar
                    dataKey="actual"
                    name="实际投入"
                    fill="var(--accent)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
              <details className="insight-values">
                <summary>查看每日数值</summary>
                <dl>
                  {result.days.map((day) => (
                    <div key={day.date}>
                      <dt>{day.date}</dt>
                      <dd>{formatMinutes(day.actualMinutes)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </>
          ) : (
            <p className="empty-copy">
              还没有记录实际耗时。完成任务后，记下投入的分钟数。
            </p>
          )}
        </Surface>
        <Surface className="insight-chart">
          <header>
            <h2>时间去了哪里</h2>
            <span>普通任务项目</span>
          </header>
          {projectTotal > 0 ? (
            <ul className="insight-projects">
              {distributionData
                .filter((item) => item.minutes > 0)
                .map((item, index) => (
                  <li key={`${index}-${item.name}`}>
                    <div>
                      <b>{item.name}</b>
                      <span>
                        {formatMinutes(item.minutes)}
                        <small>
                          {Math.round((item.minutes / projectTotal) * 100)}%
                        </small>
                      </span>
                    </div>
                    <div className="insight-project-track" aria-hidden="true">
                      <i style={{ width: `${(item.minutes / projectTotal) * 100}%` }} />
                    </div>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="empty-copy">为任务记录实际耗时后，这里会展示项目分布。</p>
          )}
        </Surface>
      </div>
      <Surface className="insight-estimates">
        <h2>预计与实际</h2>
        <strong>
          {summary.pairedCount
            ? formatDeviation(summary.actual, summary.planned)
            : '暂无足够数据'}
        </strong>
        <p>
          {summary.pairedCount
            ? `基于 ${summary.pairedCount} 项同时记录预计和实际的任务；预计 ${formatMinutes(summary.planned)}，实际 ${formatMinutes(summary.actual)}。`
            : '同时填写预计与实际耗时后，再比较估时差异。'}
        </p>
      </Surface>
      <ReportDocument report={report} />
    </div>
  );
}
