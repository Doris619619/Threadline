/** @fileoverview 项目任务总览直接筛选原 Task；阶段归属和安排日期不会改变项目集合或产生重复记录。 */
import type { Task } from '@/types/domain';

export const projectTaskFilters = [
  ['all', '全部'],
  ['waiting', '未安排'],
  ['scheduled', '已安排'],
  ['completed', '已完成'],
  ['abandoned', '已放弃'],
  ['trashed', '回收站'],
] as const;
export type ProjectTaskFilter = (typeof projectTaskFilters)[number][0];

/** 历史状态优先于 completed；有效任务才归入已完成或待执行，不因是否属于阶段改变判定。 */
export function projectTaskState(task: Task): Exclude<ProjectTaskFilter, 'all'> {
  if (task.status === 'trashed' || task.status === 'abandoned') return task.status;
  if (task.completed) return 'completed';
  return task.status === 'waiting' ? 'waiting' : 'scheduled';
}

/** 按项目读取完整真源，稳定 ID 去重；默认包含保留的历史，各筛选数均基于这一集合。 */
export function projectTasks(tasks: Task[], projectId: string): Task[] {
  return [
    ...new Map(
      tasks
        .filter((task) => task.projectId === projectId)
        .map((task) => [task.id, task]),
    ).values(),
  ];
}

/** 查询只影响视图，标题搜索与状态筛选可组合，排序保留任务来源中的稳定顺序。 */
export function filterProjectTasks(
  tasks: Task[],
  filter: ProjectTaskFilter,
  search: string,
): Task[] {
  return tasks.filter(
    (task) =>
      (filter === 'all' || projectTaskState(task) === filter) &&
      task.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
}
