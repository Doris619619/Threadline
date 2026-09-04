/** @fileoverview 创建具有显式 UUID 项目引用的 Task 领域对象，不选择默认项目。 */

import type { Task } from '@/types/domain';

/** 根据调用方提供的业务日期和项目 UUID 创建任务；不读取 seed 或固定项目 ID。 */
export function makeTask(
  businessDate: string,
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
    date: businessDate,
    plannedStartTime,
    plannedEndTime,
    plannedDurationMinutes,
    actualDurationMinutes,
    completed,
    status: 'active',
    importance: 'normal',
    createdAt: businessDate,
    updatedAt: businessDate,
  };
}
