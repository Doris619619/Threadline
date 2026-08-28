/** @fileoverview 工作台首开种子、过期回收站清理与按日期 Daily 实例化规则。 */

import { seedDaily, type Daily } from '@/features/daily/daily-panel';
import { getLocalDateKey } from '@/lib/local-date';
import type { Project, Task } from '@/types/domain';

/** 创建内置项目，并让创建日期保持用户本地业务日期。 */
export function createProjectSeed(today = getLocalDateKey()): Project[] {
  return [
    { id: 'work', name: '工作', color: '#4f8cff', status: 'active', createdAt: today },
    {
      id: 'course',
      name: '课程',
      color: '#8b7cf6',
      status: 'active',
      createdAt: today,
    },
    {
      id: 'research',
      name: 'AI研究',
      color: '#38a774',
      status: 'active',
      createdAt: today,
    },
    { id: 'life', name: '生活', color: '#e9a04b', status: 'active', createdAt: today },
    { id: 'other', name: '其他', color: '#8793a7', status: 'active', createdAt: today },
  ];
}

/** 创建任务实体，使业务日期和首次元数据保持同一日期语义。 */
export function makeTask(
  today: string,
  id: string,
  projectId: string,
  title: string,
  plannedStartTime?: string,
  plannedEndTime?: string,
  plannedDurationMinutes?: number,
  actualDurationMinutes?: number,
  completed = false,
): Task {
  return {
    id,
    projectId,
    title,
    date: today,
    plannedStartTime,
    plannedEndTime,
    plannedDurationMinutes,
    actualDurationMinutes,
    completed,
    status: 'active',
    createdAt: today,
    updatedAt: today,
  };
}

/** 创建首次打开时的演示任务。 */
export function createInitialTasks(today = getLocalDateKey()): Task[] {
  return [
    makeTask(today, 'email', 'work', '邮件处理', '08:30', undefined, 40),
    makeTask(today, 'stats', 'course', '统计课预习', '10:45', undefined, 60),
    makeTask(today, 'paper', 'course', '领域论文', '12:00', '13:30', 90, 56, true),
    makeTask(today, 'demo', 'research', '跑 Demo', '14:20', undefined, 45),
    makeTask(today, 'meeting', 'work', '会议记录', '15:10', '16:10', 60, 58, true),
    makeTask(today, 'gym', 'life', '健身', '17:00', undefined, 60),
    makeTask(today, 'adapter', 'other', '买转换插头'),
    makeTask(today, 'pickup', 'life', '取快递'),
  ];
}

/** 判断回收站任务是否超过 30 天保留期。 */
function isTrashExpired(task: Task): boolean {
  return (
    task.status === 'trashed' &&
    task.deletedAt !== undefined &&
    new Date(task.deletedAt).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000
  );
}

/** 读取持久化任务时剔除已超过保留期的回收站记录。 */
export function withoutExpiredTasks(items: Task[]): Task[] {
  return items.filter((task) => !isTrashExpired(task));
}

/** 为给定日期实例化 Daily；只有当天首开保留模板的演示完成状态。 */
export function createDailyInstance(
  date: string,
  templates: Daily[] = seedDaily,
): Daily[] {
  if (date === getLocalDateKey()) return structuredClone(templates);
  return templates.map((item) => ({
    ...item,
    actual: 0,
    result: '',
    completed: false,
    children: item.children.map((child) => ({ ...child, actual: 0, completed: false })),
  }));
}
