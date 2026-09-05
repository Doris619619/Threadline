/** @fileoverview 为公开 Preview 提供虚构的当日任务与 Daily，不包含用户云端数据。 */

import type { Daily } from '@/features/daily/types';
import { createInitialTasks } from '@/features/workspace/workspace-seed';
import { getLocalDateKey } from '@/lib/local-date';

/** 保留今日、重要与普通三种任务，减少首屏滚动并展示分类。 */
export function createDemoTasks(today = getLocalDateKey()) {
  return createInitialTasks(today)
    .filter((task) => ['email', 'paper', 'adapter', 'pickup'].includes(task.id))
    .map((task) =>
      task.id === 'adapter'
        ? { ...task, title: '提交课程项目材料', importance: 'important' as const }
        : task,
    );
}

/** 每个浏览器首开创建独立示例；子项计划固定，执行状态留给访问者操作。 */
export function createDemoDailies(): Daily[] {
  return [
    {
      id: 'demo-algorithm',
      title: '算法训练',
      actual: 0,
      completed: false,
      result: '',
      children: [
        {
          id: 'demo-practice',
          title: '完成一道动态规划题并整理思路',
          plannedDurationMinutes: 30,
          actual: 0,
          completed: false,
        },
        {
          id: 'demo-review',
          title: '复盘昨天的错题',
          plannedDurationMinutes: 20,
          actual: 0,
          completed: false,
        },
      ],
    },
    {
      id: 'demo-ielts',
      title: '雅思',
      actual: 0,
      completed: false,
      result: '',
      children: [],
    },
  ];
}
