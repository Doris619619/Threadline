/** @fileoverview 首页统计栏统一显示剩余/总预计与实际投入；统计范围和缺值保留在可访问说明中。 */
import { StatItem } from '@/components/ui/stat-item';
import { formatMinutes } from '../task-time';

/** 分子是未完成工作量，分母包含已完成任务；只显示已知分钟，零值仍是有效估时。 */
export function DayTimeStats({
  remaining,
  total,
  actual,
  remainingMissing,
  totalMissing,
}: {
  remaining: number;
  total: number;
  actual: number;
  remainingMissing: number;
  totalMissing: number;
}) {
  return (
    <div className="metric-strip" aria-label="当日时间统计（含 Daily）">
      <div className="day-time-planned-stat">
        <StatItem
          label="剩余 / 当日预计"
          value={
            <em
              className="day-time-fraction"
              aria-label={
                '剩余预计 ' +
                formatMinutes(remaining) +
                '，总预计 ' +
                formatMinutes(total)
              }
              title={`包含日程和 Daily；未估时：剩余 ${remainingMissing} 项，全天 ${totalMissing} 项`}
            >
              <em data-day-remaining>{formatMinutes(remaining)}</em>
              <em className="day-time-fraction-divider" aria-hidden="true">
                /
              </em>
              <em className="day-time-total" data-day-total>
                {formatMinutes(total)}
              </em>
            </em>
          }
        />
      </div>
      <StatItem label="今日实际投入" value={<em>{formatMinutes(actual)}</em>} />
    </div>
  );
}
