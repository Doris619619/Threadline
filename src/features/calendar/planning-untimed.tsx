/** @fileoverview 展示已属于浏览日期、尚未设置开始时间的任务，提供直接定时间与完整详情入口。 */
import { useState } from 'react';
import { ChevronDown, Clock3 } from 'lucide-react';
import type { Task } from '@/types/domain';

/** 前两项直接可见，更多项由用户展开；切换日期时由父组件 key 重置展开状态。 */
export function PlanningUntimed({
  tasks,
  busy,
  onSelect,
  onSetTime,
}: {
  tasks: Task[];
  busy: boolean;
  onSelect: (tasks: Task[]) => void;
  onSetTime: (task: Task) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ordered = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const visible = expanded ? ordered : ordered.slice(0, 2);
  if (tasks.length === 0) return null;
  return (
    <section className="planning-untimed" aria-label="当天时间待定">
      <header className="planning-untimed-heading">
        <h3>未定时间</h3>
        {tasks.length > 2 && (
          <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? '收起' : `+${tasks.length - 2}`}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="planning-untimed-items">
        {visible.map((task) => {
          return (
            <div className="planning-undated-task" key={task.id} data-task-id={task.id}>
              <button
                className="planning-undated-main"
                aria-label={`${task.title}，查看详情`}
                disabled={busy}
                onClick={(event) => {
                  event.currentTarget.focus();
                  onSelect([task]);
                }}
              >
                <span>{task.title}</span>
              </button>
              <button
                className="planning-set-time"
                aria-label={`为${task.title}设置时间`}
                disabled={busy}
                onClick={(event) => {
                  event.currentTarget.focus();
                  onSetTime(task);
                }}
              >
                <Clock3 size={17} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
