/** @fileoverview 工作台首开种子、过期回收站清理与按日期 Daily 实例化规则。 */

import type { Daily } from '@/features/daily/types';
import { getLocalDateKey } from '@/lib/local-date';
import { makeTask } from '@/lib/task-factory';
import type { Project, Task } from '@/types/domain';

/** 仅供显式本地 test adapter 使用的旧版 Daily fixture，云初始化不会读取。 */
const seedDaily: Daily[] = [
  {
    id: 'listen',
    title: '听力训练',
    actual: 30,
    result: '完成听力训练',
    completed: true,
    children: [
      { title: '精听', plannedDurationMinutes: 0, completed: true, actual: 20 },
      { title: '跟读', plannedDurationMinutes: 0, completed: true, actual: 10 },
      { title: '复盘错题', plannedDurationMinutes: 0, completed: false, actual: 0 },
    ],
  },
  {
    id: 'vocab',
    title: '背单词',
    actual: 0,
    result: '',
    completed: false,
    children: [
      { title: '新词', plannedDurationMinutes: 0, completed: false, actual: 0 },
      { title: '复习', plannedDurationMinutes: 0, completed: false, actual: 0 },
    ],
  },
  {
    id: 'weekly',
    title: '发布周报',
    actual: 0,
    result: '',
    completed: false,
    children: [],
  },
];

/** 创建内置项目，并让创建日期保持用户本地业务日期。 */
export function createProjectSeed(today = getLocalDateKey()): Project[] {
  return [
    {
      id: 'work',
      name: '工作',
      color: '#4f8cff',
      status: 'active',
      position: 0,
      createdAt: today,
    },
    {
      id: 'course',
      name: '课程',
      color: '#8b7cf6',
      status: 'active',
      position: 1,
      createdAt: today,
    },
    {
      id: 'research',
      name: 'AI研究',
      color: '#38a774',
      status: 'active',
      position: 2,
      createdAt: today,
    },
    {
      id: 'life',
      name: '生活',
      color: '#e9a04b',
      status: 'active',
      position: 3,
      createdAt: today,
    },
    {
      id: 'other',
      name: '其他',
      color: '#8793a7',
      status: 'active',
      position: 4,
      isFallback: true,
      createdAt: today,
    },
  ];
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
