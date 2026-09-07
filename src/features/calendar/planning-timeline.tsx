/** @fileoverview 单日小时画布：真实时间块、短任务刻线及重叠任务入口，点击后查看完整任务操作。 */
import { useEffect, useState, type CSSProperties } from 'react';
import { getLocalDateKey } from '@/lib/local-date';
import type { Project, Task } from '@/types/domain';
import { layoutPlanningTimeline, planningTimeLabel } from './planning-timeline-layout';

/** 将分钟映射到可随文字一起放大的 rem 坐标，每小时 6rem。 */
function offset(minutes: number): string {
  return `${minutes / 10}rem`;
}

/** 当前时间来自真实时钟，每分钟及页面重新可见时校准；其他日期不显示现在指示。 */
function usePlanningNow(date: string) {
  const [now, setNow] = useState<Date>();
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return now && getLocalDateKey(now) === date
    ? now.getHours() * 60 + now.getMinutes()
    : undefined;
}

/** 日期只控制画布范围与现在指示；点击时间块交由父页面打开现有任务操作。 */
export function PlanningTimeline({
  date,
  tasks,
  projects,
  busy,
  onSelect,
}: {
  date: string;
  tasks: Task[];
  projects: Project[];
  busy: boolean;
  onSelect: (tasks: Task[]) => void;
}) {
  const layout = layoutPlanningTimeline(tasks);
  const now = usePlanningNow(date);
  const hours = Array.from(
    { length: Math.min(layout.end, 1440) / 60 - layout.start / 60 + 1 },
    (_, i) => layout.start + i * 60,
  );
  return (
    <section className="planning-timeline" aria-label="当天时间轴">
      <div className="planning-timeline-caption">
        <span>
          时间安排 <span>{tasks.length}</span>
        </span>
        <span>点击时间块查看详情</span>
      </div>
      <div
        className="planning-time-canvas"
        style={{ height: offset(layout.end - layout.start) }}
      >
        {hours.map((hour) => (
          <div
            key={hour}
            className="planning-hour"
            data-current={now !== undefined && Math.abs(hour - now) < 10}
            style={{ top: offset(hour - layout.start) }}
            aria-hidden="true"
          >
            <span>{planningTimeLabel(hour)}</span>
            <i />
          </div>
        ))}
        <div className="planning-event-area">
          {layout.groups.map((group) =>
            group.columns > 3 ? (
              <button
                key={group.events[0].task.id}
                className="planning-time-event planning-time-cluster"
                style={{
                  top: offset(group.start - layout.start),
                  height: offset(group.end - group.start),
                }}
                disabled={busy}
                onClick={(event) => {
                  event.currentTarget.focus();
                  onSelect(group.events.map((item) => item.task));
                }}
              >
                <strong>{group.events.length} 项重叠安排</strong>
                <span>{planningTimeLabel(group.start)} 起 · 点击展开</span>
              </button>
            ) : (
              group.events.map((item) => {
                const project = projects.find(
                  (project) => project.id === item.task.projectId,
                );
                const style: CSSProperties = {
                  top: offset(item.start - layout.start),
                  height: offset(item.displayEnd - item.start),
                  left: `calc(${(item.column * 100) / group.columns}% + 3px)`,
                  width: `calc(${100 / group.columns}% - 6px)`,
                };
                return (
                  <button
                    key={item.task.id}
                    className="planning-time-event"
                    style={style}
                    data-task-id={item.task.id}
                    data-point={item.end === undefined || item.end === item.start}
                    data-short={item.displayEnd - item.start <= 40}
                    data-columns={group.columns}
                    aria-label={`${item.task.title}，${item.task.plannedStartTime}${item.end !== undefined ? `至${item.task.plannedEndTime}` : '，结束未定'}${project ? `，${project.name}` : ''}，查看详情`}
                    disabled={busy}
                    onClick={(event) => {
                      event.currentTarget.focus();
                      onSelect([item.task]);
                    }}
                  >
                    <i
                      className="planning-duration-mark"
                      aria-hidden="true"
                      style={{
                        height:
                          item.end !== undefined && item.end > item.start
                            ? offset(item.end - item.start)
                            : '0.5rem',
                      }}
                    />
                    <strong>{item.task.title}</strong>
                    <span className="planning-event-time">
                      {item.task.plannedStartTime}
                      {item.end !== undefined
                        ? `–${item.task.plannedEndTime}`
                        : ' · 结束未定'}
                    </span>
                    {project && (
                      <span className="planning-event-project">{project.name}</span>
                    )}
                  </button>
                );
              })
            ),
          )}
          {now !== undefined && now >= layout.start && now < layout.end && (
            <div
              className="planning-now"
              style={{ top: offset(now - layout.start) }}
              aria-label={`现在 ${planningTimeLabel(now)}`}
            >
              <span>{planningTimeLabel(now)}</span>
              <i />
            </div>
          )}
          {tasks.length === 0 && (
            <p className="planning-timeline-empty">这一天还没有定时安排。</p>
          )}
        </div>
      </div>
    </section>
  );
}
