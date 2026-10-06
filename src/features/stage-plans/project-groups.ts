/** @fileoverview 按原项目顺序派生阶段任务分组，保留归档/失效归属并将其他项目放在末尾。 */
import type { Project, Task } from '@/types/domain';

/** 输入已经过状态筛选的原 Task；只重排项目组，组内顺序和任务身份保持不变。 */
export function stageProjectGroups(tasks: Task[], projects: Project[]) {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const rows = groups.get(task.projectId) ?? [];
    rows.push(task);
    groups.set(task.projectId, rows);
  }
  return [...groups]
    .map(([id, rows]) => ({
      id,
      tasks: rows,
      project: projects.find((project) => project.id === id),
    }))
    .sort((left, right) => {
      const fallback =
        Number(!!left.project?.isFallback) - Number(!!right.project?.isFallback);
      const position =
        (left.project?.position ??
          projects.findIndex((project) => project.id === left.id)) -
        (right.project?.position ??
          projects.findIndex((project) => project.id === right.id));
      return fallback || position || left.id.localeCompare(right.id);
    });
}
