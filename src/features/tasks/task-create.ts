/** @fileoverview 将六项日程草稿验证并转换为任务；供单条创建与稳定编号的批量导入共同复用。 */

import { taskFormSchema } from '@/lib/schemas';
import { resolveActiveProject } from '@/lib/project-rules';
import type { TimedTaskDraft } from '@/features/tasks/task-drafts';
import {
  normalizeTime,
  parseDurationInput,
  parseEstimateMinutes,
} from '@/features/tasks/task-time';
import type { Project, Task } from '@/types/domain';

/**
 * 验证同日任务草稿并返回未保存的任务；显式 ID 可在失败重试中复用，不自动推算留空的预计时长。
 * 日期由当前视图提供，选填空值保留 undefined；项目必须引用已有可用项目。
 */
export function buildTimedTask(
  draft: TimedTaskDraft,
  projects: Project[],
  selectedDate: string,
  id: string = crypto.randomUUID(),
): Task {
  const planned = parseEstimateMinutes(draft.planned);
  const actual = parseDurationInput(draft.actual);
  const parsed = taskFormSchema.safeParse({
    title: draft.title,
    projectId: draft.projectId,
    plannedMinutes: planned,
    actualMinutes: actual,
  });
  if (!parsed.success)
    throw new Error(parsed.error.issues[0]?.message ?? '请检查任务信息');
  const project = resolveActiveProject(projects, parsed.data.projectId);
  if (!project || project.deletedAt) throw new Error('请先创建一个可用项目');
  const start = normalizeTime(draft.startTime);
  const end = normalizeTime(draft.endTime);
  if (draft.startTime.trim() && !start) throw new Error('开始时间格式应为 08:30');
  if (draft.endTime.trim() && (!start || !end || end <= start))
    throw new Error('结束时间需晚于有效的开始时间');
  const now = new Date().toISOString();
  return {
    id,
    projectId: project.id,
    title: parsed.data.title,
    date: selectedDate,
    plannedStartTime: start,
    schedulePendingTime: !start,
    plannedEndTime: end,
    plannedDurationMinutes: planned,
    actualDurationMinutes: actual,
    completed: draft.completed,
    completedAt: draft.completed ? now : undefined,
    status: 'active',
    importance: 'normal',
    createdAt: now,
    updatedAt: now,
  };
}
