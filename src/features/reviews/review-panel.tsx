'use client';
import { useState } from 'react';
import { Surface } from '@/components/ui/surface';

const data = {
  week: {
    total: '6h30min',
    tasks: '2 / 8',
    rate: '25%',
    plan: '6h5min',
    actual: '6h30min',
    moves: ['移期 2', '放弃 1', '进入待安排 1'],
  },
  month: {
    total: '42h30min',
    tasks: '52 / 61',
    rate: '85.2%',
    plan: '38h',
    actual: '42h30min',
    moves: ['移期 7', '放弃 3', '进入待安排 5'],
  },
};
export function ReviewPanel() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const report = data[period];
  return (
    <div className="review-panel">
      <header>
        <div>
          <h2>{period === 'week' ? '周复盘' : '月复盘'}</h2>
          <p>所有统计都由任务、Daily 与历史流转记录聚合。</p>
        </div>
        <div className="period-toggle">
          <button
            className={period === 'week' ? 'active' : ''}
            onClick={() => setPeriod('week')}
          >
            周
          </button>
          <button
            className={period === 'month' ? 'active' : ''}
            onClick={() => setPeriod('month')}
          >
            月
          </button>
        </div>
      </header>
      <div className="review-grid">
        <Metric
          title="总投入时间"
          value={report.total}
          detail="普通与 Daily 实际耗时"
        />
        <Metric title="普通任务完成率" value={report.rate} detail={report.tasks} />
        <Metric
          title="计划 vs 实际"
          value={report.actual}
          detail={`预计 ${report.plan}`}
        />
      </div>
      <Surface className="review-details">
        <section>
          <h3>各项目投入</h3>
          <div className="project-bars">
            <Bar label="AI研究" value="2h30min" percent={78} />
            <Bar label="课程" value="1h56min" percent={62} />
            <Bar label="生活" value="1h04min" percent={39} />
          </div>
        </section>
        <section>
          <h3>Daily 完成情况</h3>
          <p>听力训练　1/1　·　30min</p>
          <p>背单词　0/1　·　0min</p>
          <p>发布周报　0/1　·　0min</p>
        </section>
        <section>
          <h3>任务流转</h3>
          {report.moves.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </section>
      </Surface>
    </div>
  );
}
function Metric({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Surface className="review-metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </Surface>
  );
}
function Bar({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div className="bar-row">
      <span>{label}</span>
      <i>
        <b style={{ width: `${percent}%` }} />
      </i>
      <small>{value}</small>
    </div>
  );
}
