/**
 * @fileoverview 封装任务和项目创建、编辑保存；不持有面板草稿或弹窗开关状态。
 */

import { calculateDuration } from '@/lib/task-rules';
import { taskFormSchema } from '@/lib/schemas';
import { getLocalDateKey } from '@/lib/local-date';
import { resolveActiveProject } from '@/lib/project-rules';
import { makeTask } from '@/lib/task-factory';
import type {
  CompactQuickTaskDraft,
  CompactTimedTaskDraft,
  QuickTaskDraft,
  TimedTaskDraft,
} from '@/features/tasks/task-drafts';
import { normalizeTime, parseDurationInput } from '@/features/tasks/task-time';
import type { Project, Task } from '@/types/domain';

/** 统一返回新增面板可显示的输入错误，空标题沿用既有的静默取消行为。 */
export function useTaskCreateAndEdit({
  createTask,
  createProject,
  editing,
  projects,
  selectedDate,
  updateTask,
}: {
  createTask: (task: Task) => Promise<Task>;
  createProject: (project: Project) => Promise<Project>;
  editing: Task | undefined;
  projects: Project[];
  selectedDate: string;
  updateTask: (task: Task) => void;
}) {
  /** 等待项目持久化确认后返回它，后续 task 写入不再与项目 FK 竞争。 */
  const createProjectDirectly = async (name: string): Promise<Project> => {
    const trimmed = name.trim();
    const colors = ['#4f8cff', '#8b7cf6', '#38a774', '#e9a04b', '#ec4899', '#06b6d4'];
    const newProject: Project = {
      id: crypto.randomUUID(),
      name: trimmed,
      color: colors[projects.length % colors.length],
      status: 'active',
      position: Math.max(-1, ...projects.map((project) => project.position ?? -1)) + 1,
      isFallback: false,
      createdAt: getLocalDateKey(),
    };
    return createProject(newProject);
  };

  /** 从日程行草稿创建任务，不改变既有的同日时间范围限制。 */
  const createTimedTask = async (draft: TimedTaskDraft) => {
    if (!draft.title.trim()) return { cancelled: true };
    const projectId = resolveActiveProject(projects, draft.projectId)?.id;
    if (!projectId) return { error: '请先创建一个可用项目' };
    const start = normalizeTime(draft.startTime);
    const end = normalizeTime(draft.endTime);
    if (draft.startTime.trim() && !start) return { error: '开始时间格式应为 08:30' };
    if (draft.endTime.trim() && (!start || !end || end <= start)) {
      return { error: '结束时间需晚于有效的开始时间' };
    }
    const duration = start && end ? calculateDuration(start, end) : undefined;
    const task: Task = {
      id: crypto.randomUUID(),
      projectId,
      title: draft.title.trim(),
      date: selectedDate,
      plannedStartTime: start,
      schedulePendingTime: !start,
      plannedEndTime: end,
      plannedDurationMinutes: parseDurationInput(draft.planned) ?? duration,
      actualDurationMinutes: parseDurationInput(draft.actual),
      completed: draft.completed,
      completedAt: draft.completed ? new Date().toISOString() : undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { task: await createTask(task) };
  };

  /** 从无时间待办行草稿创建任务，不推断时间。 */
  const createQuickTask = async (draft: QuickTaskDraft) => {
    if (!draft.title.trim()) return { cancelled: true };
    const projectId = resolveActiveProject(projects, draft.projectId)?.id;
    if (!projectId) return { error: '请先创建一个可用项目' };
    const task: Task = {
      id: crypto.randomUUID(),
      projectId,
      title: draft.title.trim(),
      date: selectedDate,
      completed: draft.completed,
      completedAt: draft.completed ? new Date().toISOString() : undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { task: await createTask(task) };
  };

  /** 从迷你今日写入有可选起止时间的任务，并复用完整工作台的持久化字段。 */
  const createCompactTimedTask = async (draft: CompactTimedTaskDraft) => {
    const projectId = resolveActiveProject(projects, draft.projectId)?.id;
    if (!projectId) throw new Error('请先创建一个可用项目');
    const task: Task = {
      id: crypto.randomUUID(),
      projectId,
      title: draft.title,
      date: selectedDate,
      plannedStartTime: draft.start,
      plannedEndTime: draft.end,
      plannedDurationMinutes:
        draft.start && draft.end
          ? calculateDuration(draft.start, draft.end)
          : undefined,
      schedulePendingTime: !draft.start,
      completed: false,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await createTask(task);
  };

  /** 从迷你今日写入无时间待办，不额外推断时间或完成状态。 */
  const createCompactQuickTask = async (draft: CompactQuickTaskDraft) => {
    const projectId = resolveActiveProject(projects, draft.projectId)?.id;
    if (!projectId) throw new Error('请先创建一个可用项目');
    const task: Task = {
      id: crypto.randomUUID(),
      projectId,
      title: draft.title,
      date: selectedDate,
      completed: false,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await createTask(task);
  };

  /** 验证 Dialog FormData 并保留现有跨午夜拒绝和新建双写流程。 */
  const saveTask = async (form: FormData): Promise<string | undefined> => {
    const title = String(form.get('title') ?? '').trim();
    const startRaw = String(form.get('start') ?? '');
    const endRaw = String(form.get('end') ?? '');
    const start = startRaw ? normalizeTime(startRaw) : undefined;
    const end = endRaw ? normalizeTime(endRaw) : undefined;
    const parsed = taskFormSchema.safeParse({
      title,
      projectId: String(form.get('project') ?? ''),
      plannedMinutes: numberOrUndefined(form.get('planned')),
      actualMinutes: numberOrUndefined(form.get('actual')),
    });
    if (!parsed.success) return parsed.error.issues[0]?.message ?? '请检查任务信息';
    if (startRaw && !start) return '开始时间格式应为 1420 或 14:20';
    if (endRaw && !end) return '结束时间格式应为 1530 或 15:30';
    if (end && !start) return '填写结束时间前，请先填写开始时间';
    if (end && start && end < start) return '暂不支持跨午夜任务，请选择同一天内的时间';
    const planned =
      calculateDuration(start, end) ?? numberOrUndefined(form.get('planned'));
    const base =
      editing ??
      makeTask(
        getLocalDateKey(),
        crypto.randomUUID(),
        String(form.get('project')),
        title,
      );
    const nextTask: Task = {
      ...base,
      title,
      projectId: String(form.get('project')),
      date: editing?.date ?? selectedDate,
      plannedStartTime: start,
      plannedEndTime: end,
      plannedDurationMinutes: planned,
      actualDurationMinutes: numberOrUndefined(form.get('actual')),
      updatedAt: new Date().toISOString(),
    };
    if (editing) updateTask(nextTask);
    else await createTask(nextTask);
    return undefined;
  };

  return {
    createCompactQuickTask,
    createCompactTimedTask,
    createProjectDirectly,
    createQuickTask,
    createTimedTask,
    saveTask,
  };
}

/** 保持 Dialog 的 FormData 数字空值处理，与原组件一致。 */
function numberOrUndefined(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text ? Number(text) : undefined;
}
