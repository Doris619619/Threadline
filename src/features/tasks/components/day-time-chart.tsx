/** @fileoverview 首页所选日期的任务时间分布，折叠图表保留日程操作空间。 */
'use client';
import { useId } from 'react';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { StageTimeChart } from '@/features/stage-plans/time-chart';
import type { SaveStageEstimate } from '@/features/stage-plans/task-estimate-editor';
import type { Project, Task, TaskTimeEntry } from '@/types/domain';

/** 复用阶段圆环与账本口径；收起时仍挂载编辑草稿，切换日期才重置选择。 */
export function DayTimeChart({
  tasks,
  projects,
  today,
  date,
  entries,
  onSaveEstimate,
  onSaveActual,
}: {
  tasks: Task[];
  projects: Project[];
  today: string;
  date: string;
  entries?: TaskTimeEntry[];
  onSaveEstimate: SaveStageEstimate;
  onSaveActual: SaveStageEstimate;
}) {
  const [collapsed, setCollapsed] = usePersistentState(
    'threadline.day-time-collapsed.v1',
    false,
  );
  const id = useId();
  return (
    <div className="day-time-distribution">
      <button
        type="button"
        className="home-layout-toggle"
        aria-expanded={!collapsed}
        aria-controls={id}
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? '展开当日时间分布' : '收起当日时间分布'}
      </button>
      <div id={id} hidden={collapsed}>
        <StageTimeChart
          key={date}
          tasks={tasks}
          projects={projects}
          today={today}
          day={{ date, entries }}
          onSaveEstimate={onSaveEstimate}
          onSaveActual={onSaveActual}
        />
      </div>
    </div>
  );
}
