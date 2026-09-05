/** @fileoverview 渲染专用打印报告，避免将交互式洞察界面原样交给浏览器或 Electron。 */

import type { ReportData } from './report-builder';

/** 将分钟转为报告中的可读文本。 */
function formatMinutes(minutes: number): string {
  return minutes < 60
    ? `${minutes} 分钟`
    : `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}`;
}

/** 描述估时偏差，但不把实际低于预计错误标记为效率提升。 */
function formatDeviation(actual: number, planned: number): string {
  const difference = actual - planned;
  return difference === 0
    ? '与预计一致'
    : difference > 0
      ? `比预计多 ${formatMinutes(difference)}`
      : `比预计少 ${formatMinutes(-difference)}`;
}

/** 渲染只在打印模式显示的报告 DOM。 */
export function ReportDocument({ report }: { report: ReportData }) {
  return (
    <article className="report-document" data-report-document>
      <header>
        <p>Threadline 洞察报告</p>
        <h1>{report.title}</h1>
      </header>
      <dl>
        <div>
          <dt>实际投入</dt>
          <dd>{formatMinutes(report.totalActualMinutes)}</dd>
        </div>
        <div>
          <dt>已填写预计合计</dt>
          <dd>{formatMinutes(report.totalPlannedMinutes)}</dd>
        </div>
        <div>
          <dt>估时偏差</dt>
          <dd>
            {report.estimateComparison?.pairedCount
              ? formatDeviation(
                  report.estimateComparison.actual,
                  report.estimateComparison.planned,
                )
              : '暂无足够数据'}
          </dd>
        </div>
      </dl>
      <p>估时偏差仅比较同时记录预计和实际的普通任务；未填写预计不视为零。</p>
      <section>
        <h2>项目投入</h2>
        <table>
          <thead>
            <tr>
              <th>项目</th>
              <th>实际投入</th>
              <th>预计时长</th>
              <th>数据质量</th>
            </tr>
          </thead>
          <tbody>
            {report.projects.map((project) => (
              <tr key={project.projectId}>
                <td>{project.projectName}</td>
                <td>{formatMinutes(project.actualMinutes)}</td>
                <td>{formatMinutes(project.plannedMinutes)}</td>
                <td>{project.quality === 'exact' ? '精确记录' : '旧版项目汇总'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {report.incompleteCount > 0 && (
        <p className="report-quality-note">
          部分旧任务缺少明确业务日期，未被伪造为精确历史。
        </p>
      )}
    </article>
  );
}
