/** @fileoverview 从阶段原 Task 派生项目与任务时间占比，不持久化第二份统计数据。 */
import type { Project, Task, TaskTimeEntry } from '@/types/domain';
import { stageProjectGroups } from './project-groups';
export type StageTimeMetric = 'planned' | 'remaining' | 'actual';
export type StageTimeItem = {
  id: string;
  title: string;
  minutes?: number;
  color: string;
};
export type StageTimeGroup = {
  id: string;
  name: string;
  color: string;
  total: number;
  items: StageTimeItem[];
};
export type StageTimeSector = StageTimeItem & {
  projectId: string;
  projectColor?: string;
  start: number;
  fraction: number;
};

/** 按稳定项目/任务顺序分组；排除删除/放弃项，未填和零时长仍列明但不虚构扇区。 */
export function stageTimeBreakdown(
  tasks: Task[],
  projects: Project[],
  stageId: string | undefined,
  metric: StageTimeMetric,
  day?: { date: string; entries?: TaskTimeEntry[] },
) {
  const dailyEntries = day?.entries?.filter((entry) => entry.date === day.date);
  const members = tasks.filter(
    (task) =>
      (stageId === undefined || task.stagePlanId === stageId) &&
      (day && metric === 'actual' && dailyEntries
        ? dailyEntries.some((entry) => entry.taskId === task.id) ||
          (task.status === 'active' && task.date === day.date)
        : !task.deletedAt &&
          task.status !== 'trashed' &&
          task.status !== 'abandoned' &&
          (!day || (task.status === 'active' && task.date === day.date))) &&
      (metric !== 'remaining' || !task.completed),
  );
  const groups: StageTimeGroup[] = [];
  for (const { id, project, tasks: rows } of stageProjectGroups(members, projects)) {
    const color = project?.isFallback ? '#8792a2' : (project?.color ?? '#8792a2');
    const items = [...rows]
      .sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )
      .map((task, index, rows) => {
        const value =
          metric === 'actual'
            ? dailyEntries
              ? dailyEntries.some((entry) => entry.taskId === task.id)
                ? dailyEntries
                    .filter((entry) => entry.taskId === task.id)
                    .reduce((sum, entry) => sum + entry.minutes, 0)
                : undefined
              : task.actualDurationMinutes
            : task.plannedDurationMinutes;
        const minutes =
          value !== undefined && Number.isFinite(value) && value >= 0
            ? value
            : undefined;
        // 色阶保留项目色相；跨预计/实际切换仍保持同一任务颜色。
        const strength = rows.length === 1 ? 85 : 55 + (index / (rows.length - 1)) * 45;
        return {
          id: task.id,
          title: task.title,
          minutes,
          color: `color-mix(in srgb, ${color} ${strength}%, var(--surface))`,
        };
      });
    groups.push({
      id,
      name: project?.name ?? '未知项目',
      color,
      items,
      total: items.reduce((sum, item) => sum + (item.minutes ?? 0), 0),
    });
  }
  // 删除后仍留在按日账本的投入保留为只读图表明细，不伪造原 Task。
  if (metric === 'actual' && dailyEntries)
    for (const entry of dailyEntries.filter(
      (entry) => !tasks.some((task) => task.id === entry.taskId),
    )) {
      let group = groups.find((group) => group.id === entry.projectId);
      if (!group) {
        const project = projects.find((project) => project.id === entry.projectId);
        group = {
          id: entry.projectId,
          name: project?.name ?? '未知项目',
          color: project?.color ?? '#8792a2',
          total: 0,
          items: [],
        };
        groups.push(group);
      }
      group.items.push({
        id: 'entry-' + entry.id,
        title: '历史投入（任务已移除）',
        minutes: entry.minutes,
        color: group.color,
      });
      group.total += entry.minutes;
    }
  return {
    groups,
    total: groups.reduce((sum, group) => sum + group.total, 0),
    missing: groups
      .flatMap((group) => group.items)
      .filter((item) => item.minutes === undefined).length,
  };
}

/** 生成任意中心的顺时针环形扇区；两段弧支持单任务占满 100%，零值由调用者排除。 */
export function ringSector(
  start: number,
  fraction: number,
  inner: number,
  outer: number,
  center = { x: 160, y: 160 },
) {
  const point = (angle: number, radius: number) =>
    `${center.x + Math.sin(angle * Math.PI * 2) * radius},${center.y - Math.cos(angle * Math.PI * 2) * radius}`;
  const end = start + fraction;
  const mid = start + fraction / 2;
  return `M${point(start, outer)} A${outer},${outer} 0 0 1 ${point(mid, outer)} A${outer},${outer} 0 0 1 ${point(end, outer)} L${point(end, inner)} A${inner},${inner} 0 0 0 ${point(mid, inner)} A${inner},${inner} 0 0 0 ${point(start, inner)} Z`;
}

/** 正时长按真实比例生成扇区，保留项目原色供引线使用；未填和零值不占据角度。 */
export function stageTimeSectors(
  groups: StageTimeGroup[],
  total: number,
): StageTimeSector[] {
  let offset = 0;
  return groups.flatMap((group) =>
    group.items
      .filter((item) => (item.minutes ?? 0) > 0)
      .map((item) => {
        const start = offset;
        offset += total ? (item.minutes ?? 0) / total : 0;
        return {
          ...item,
          projectId: group.id,
          projectColor: group.color,
          start,
          fraction: total ? (item.minutes ?? 0) / total : 0,
        };
      }),
  );
}
