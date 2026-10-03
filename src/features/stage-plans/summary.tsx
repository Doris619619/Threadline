/** @fileoverview 阶段卡与详情共享日期、时间距离和真实进度，保持同一信息语言。 */
import type { StagePlan, Task } from '@/types/domain';
import { stageTaskGroups, stageTimingLabel } from './rules';

/** 阶段范围始终展示绝对日期，跨年时补充年份。 */
function rangeDate(date: string, year: string) {
  const [dateYear, month, day] = date.split('-');
  return (
    (dateYear === year ? '' : dateYear + '年') +
    Number(month) +
    '月' +
    Number(day) +
    '日'
  );
}

/** 摘要以任务真源计算完成进度，零任务显示 0/0 而非虚构百分比。 */
export function StageSummary({
  plan,
  tasks,
  today,
  compact = false,
}: {
  plan: StagePlan;
  tasks: Task[];
  today: string;
  compact?: boolean;
}) {
  const groups = stageTaskGroups(tasks, plan.id);
  return (
    <div className={'stage-summary' + (compact ? ' is-compact' : '')}>
      <p className="stage-range">
        <time dateTime={plan.startDate}>
          {rangeDate(plan.startDate, today.slice(0, 4))}
        </time>
        <span> – </span>
        <time dateTime={plan.endDate}>
          {rangeDate(plan.endDate, today.slice(0, 4))}
        </time>
        <span> · {stageTimingLabel(plan, today)}</span>
      </p>
      <div className="stage-progress">
        <progress
          aria-label={plan.name + '完成进度'}
          max={groups.total || 1}
          value={groups.completed.length}
        />
        <span>
          {groups.completed.length} / {groups.total}
        </span>
      </div>
      <p className="stage-counts">
        {groups.waiting.length} 未安排 · {groups.scheduled.length} 已安排 ·{' '}
        {groups.completed.length} 已完成
      </p>
    </div>
  );
}
