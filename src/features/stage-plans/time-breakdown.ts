/** @fileoverview 从阶段原 Task 派生项目与任务时间占比，不持久化第二份统计数据。 */
import type { Project, Task } from '@/types/domain';
export type StageTimeMetric = 'planned' | 'actual';
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

/** 按稳定项目/任务顺序分组；排除删除/放弃项，未填和零时长仍列明但不虚构扇区。 */
export function stageTimeBreakdown(
  tasks: Task[],
  projects: Project[],
  stageId: string,
  metric: StageTimeMetric,
) {
  const members = tasks.filter(
    (task) =>
      task.stagePlanId === stageId &&
      !task.deletedAt &&
      task.status !== 'trashed' &&
      task.status !== 'abandoned',
  );
  const groups: StageTimeGroup[] = [];
  const projectIds = [...new Set(members.map((task) => task.projectId))].sort(
    (a, b) => {
      const left = projects.find((p) => p.id === a);
      const right = projects.find((p) => p.id === b);
      return (left?.position ?? 0) - (right?.position ?? 0) || a.localeCompare(b);
    },
  );
  for (const id of projectIds) {
    const project = projects.find((item) => item.id === id);
    const color = project?.isFallback ? '#8792a2' : (project?.color ?? '#8792a2');
    const items = members
      .filter((task) => task.projectId === id)
      .sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )
      .map((task, index, rows) => {
        const value =
          metric === 'planned'
            ? task.plannedDurationMinutes
            : task.actualDurationMinutes;
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
  return {
    groups,
    total: groups.reduce((sum, group) => sum + group.total, 0),
    missing: groups
      .flatMap((group) => group.items)
      .filter((item) => item.minutes === undefined).length,
  };
}

/** 生成顺时针环形扇区；两段弧支持单任务占满 100%，不使用相同起终点的退化圆弧。 */
export function ringSector(
  start: number,
  fraction: number,
  inner: number,
  outer: number,
) {
  const point = (angle: number, radius: number) =>
    `${160 + Math.sin(angle * Math.PI * 2) * radius},${160 - Math.cos(angle * Math.PI * 2) * radius}`;
  const end = start + fraction;
  const mid = start + fraction / 2;
  return `M${point(start, outer)} A${outer},${outer} 0 0 1 ${point(mid, outer)} A${outer},${outer} 0 0 1 ${point(end, outer)} L${point(end, inner)} A${inner},${inner} 0 0 0 ${point(mid, inner)} A${inner},${inner} 0 0 0 ${point(start, inner)} Z`;
}

/** 累积每项角度的纯计算，保持渲染无副作用且两圈边界完全对齐。 */
export function stageTimeSectors(groups: StageTimeGroup[], total: number) {
  let offset = 0;
  const sectors = groups.map((group) => {
    const start = offset;
    const slices = group.items.map((item) => {
      const start = offset;
      offset += total ? (item.minutes ?? 0) / total : 0;
      return { ...item, start, fraction: total ? (item.minutes ?? 0) / total : 0 };
    });
    return { ...group, start, fraction: total ? group.total / total : 0, slices };
  });
  return sectors;
}
