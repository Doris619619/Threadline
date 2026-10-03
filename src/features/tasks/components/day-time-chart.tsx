/** @fileoverview 首页右栏的所选日期时间分布；选择与显隐由首页管理，日程布局保持稳定。 */
'use client';
import { StageTimeChart } from '@/features/stage-plans/time-chart';
import type { SaveStageEstimate } from '@/features/stage-plans/task-estimate-editor';
import type { Project, Task, TaskTimeEntry } from '@/types/domain';

/** 复用阶段圆环与按日账本；右栏隐藏时仍挂载草稿，切换日期才重置选择。 */
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
  return (
    <div className="day-time-distribution">
      <StageTimeChart
        key={date}
        tasks={tasks}
        projects={projects}
        today={today}
        day={{ date, entries }}
        compactSummary
        onSaveEstimate={onSaveEstimate}
        onSaveActual={onSaveActual}
      />
    </div>
  );
}
