/**
 * @fileoverview 将 Threadline 领域工作区数据映射到受 RLS 保护的 Supabase 表。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Project,
  Task,
} from '@/types/domain';
import type { WorkspaceData, WorkspaceRepository } from '@/lib/repository';

type DbProject = {
  id: string;
  name: string;
  color: string;
  status: Project['status'];
  created_at: string;
  archived_at: string | null;
};
type DbTask = {
  id: string;
  project_id: string;
  title: string;
  scheduled_date: string | null;
  schedule_pending_time: boolean;
  planned_start_time: string | null;
  planned_end_time: string | null;
  planned_duration_minutes: number | null;
  actual_duration_minutes: number | null;
  completed: boolean;
  completed_at: string | null;
  status: Task['status'];
  backlog_importance: Task['backlogImportance'] | null;
  ddl_at: string | null;
  postponed_from: string | null;
  postponed_to: string | null;
  abandoned_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type DbDailyDefinition = {
  id: string;
  project_id: string;
  title: string;
  active: boolean;
  created_at: string;
};
type DbDailyInstance = {
  id: string;
  definition_id: string;
  instance_date: string;
  completed: boolean;
  actual_duration_minutes: number | null;
  result: string | null;
};
type DbDailySubtask = {
  id: string;
  definition_id: string;
  title: string;
  position: number;
};
type DbDailySubtaskInstance = {
  id: string;
  instance_id: string;
  subtask_id: string;
  completed: boolean;
};
type DbHistoryEvent = {
  id: string;
  task_id: string | null;
  daily_instance_id: string | null;
  event_type: string;
  occurred_at: string;
  payload: Record<string, string> | null;
};
type DbCloseRecord = {
  id: string;
  close_date: string;
  closed_at: string;
  project_minutes: Record<string, number> | null;
};

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

function assertOk<T>(
  response: { data: T | null; error: { message: string } | null },
  table: string,
): T {
  if (response.error) throw new Error(`${table}: ${response.error.message}`);
  return response.data ?? ([] as unknown as T);
}

/**
 * Maps the complete Threadline domain to the RLS-protected SQL schema.
 * The UI uses the repository interfaces, so this adapter can be enabled once
 * public Supabase configuration and an authenticated user are available.
 */
export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * 读取当前用户的完整工作区，并将数据库空值转换为可选领域字段。
   */
  async read(): Promise<WorkspaceData> {
    const [projects, tasks, definitions, instances, subtasks, subtaskInstances, history, closes] =
      await Promise.all([
        this.client.from('projects').select('*'),
        this.client.from('tasks').select('*'),
        this.client.from('daily_definitions').select('*'),
        this.client.from('daily_instances').select('*'),
        this.client.from('daily_subtasks').select('*'),
        this.client.from('daily_subtask_instances').select('*'),
        this.client.from('history_events').select('*'),
        this.client.from('daily_close_records').select('*'),
      ]);
    const projectRows = assertOk(projects, 'projects') as unknown as DbProject[];
    const taskRows = assertOk(tasks, 'tasks') as unknown as DbTask[];
    const definitionRows = assertOk(definitions, 'daily_definitions') as unknown as DbDailyDefinition[];
    const instanceRows = assertOk(instances, 'daily_instances') as unknown as DbDailyInstance[];
    const subtaskRows = assertOk(subtasks, 'daily_subtasks') as unknown as DbDailySubtask[];
    const subtaskInstanceRows = assertOk(
      subtaskInstances,
      'daily_subtask_instances',
    ) as unknown as DbDailySubtaskInstance[];
    const historyRows = assertOk(history, 'history_events') as unknown as DbHistoryEvent[];
    const closeRows = assertOk(closes, 'daily_close_records') as unknown as DbCloseRecord[];
    return {
      projects: projectRows.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        status: row.status,
        createdAt: row.created_at,
        archivedAt: optional(row.archived_at),
      })),
      tasks: taskRows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        date: optional(row.scheduled_date),
        schedulePendingTime: row.schedule_pending_time,
        plannedStartTime: optional(row.planned_start_time),
        plannedEndTime: optional(row.planned_end_time),
        plannedDurationMinutes: optional(row.planned_duration_minutes),
        actualDurationMinutes: optional(row.actual_duration_minutes),
        completed: row.completed,
        completedAt: optional(row.completed_at),
        status: row.status,
        backlogImportance: optional(row.backlog_importance),
        ddlAt: optional(row.ddl_at),
        postponedFrom: optional(row.postponed_from),
        postponedTo: optional(row.postponed_to),
        abandonedAt: optional(row.abandoned_at),
        deletedAt: optional(row.deleted_at),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      dailyDefinitions: definitionRows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        active: row.active,
        createdAt: row.created_at,
      })),
      dailyInstances: instanceRows.map((row) => ({
        id: row.id,
        definitionId: row.definition_id,
        date: row.instance_date,
        completed: row.completed,
        actualDurationMinutes: optional(row.actual_duration_minutes),
        result: optional(row.result),
      })),
      dailySubtasks: subtaskRows.map((row) => ({
        id: row.id,
        definitionId: row.definition_id,
        title: row.title,
        position: row.position,
      })),
      dailySubtaskInstances: subtaskInstanceRows.map((row) => ({
        id: row.id,
        instanceId: row.instance_id,
        subtaskId: row.subtask_id,
        completed: row.completed,
      })),
      history: historyRows.map((row) => ({
        id: row.id,
        taskId: optional(row.task_id),
        dailyInstanceId: optional(row.daily_instance_id),
        type: row.event_type,
        occurredAt: row.occurred_at,
        payload: row.payload ?? undefined,
      })),
      closeRecords: closeRows.map((row) => ({
        id: row.id,
        date: row.close_date,
        closedAt: row.closed_at,
        projectMinutes: row.project_minutes ?? {},
      })),
    };
  }

  /**
   * 将完整工作区写回 Supabase；待填时间状态随任务一并持久化。
   */
  async write(data: WorkspaceData): Promise<void> {
    await Promise.all([
      this.client.from('projects').upsert(
        data.projects.map((item) => ({
          id: item.id,
          name: item.name,
          color: item.color,
          status: item.status,
          created_at: item.createdAt,
          archived_at: item.archivedAt ?? null,
        })),
      ),
      this.client.from('tasks').upsert(
        data.tasks.map((item) => ({
          id: item.id,
          project_id: item.projectId,
          title: item.title,
          scheduled_date: item.date ?? null,
          schedule_pending_time: item.schedulePendingTime ?? false,
          planned_start_time: item.plannedStartTime ?? null,
          planned_end_time: item.plannedEndTime ?? null,
          planned_duration_minutes: item.plannedDurationMinutes ?? null,
          actual_duration_minutes: item.actualDurationMinutes ?? null,
          completed: item.completed,
          completed_at: item.completedAt ?? null,
          status: item.status,
          backlog_importance: item.backlogImportance ?? null,
          ddl_at: item.ddlAt ?? null,
          postponed_from: item.postponedFrom ?? null,
          postponed_to: item.postponedTo ?? null,
          abandoned_at: item.abandonedAt ?? null,
          deleted_at: item.deletedAt ?? null,
          created_at: item.createdAt,
          updated_at: item.updatedAt,
        })),
      ),
      this.client.from('daily_definitions').upsert(
        data.dailyDefinitions.map((item) => ({
          id: item.id,
          project_id: item.projectId,
          title: item.title,
          active: item.active,
          created_at: item.createdAt,
        })),
      ),
      this.client.from('daily_instances').upsert(
        data.dailyInstances.map((item) => ({
          id: item.id,
          definition_id: item.definitionId,
          instance_date: item.date,
          completed: item.completed,
          actual_duration_minutes: item.actualDurationMinutes ?? null,
          result: item.result ?? null,
        })),
      ),
      this.client.from('daily_subtasks').upsert(
        data.dailySubtasks.map((item) => ({
          id: item.id,
          definition_id: item.definitionId,
          title: item.title,
          position: item.position,
        })),
      ),
      this.client.from('daily_subtask_instances').upsert(
        data.dailySubtaskInstances.map((item) => ({
          id: item.id,
          instance_id: item.instanceId,
          subtask_id: item.subtaskId,
          completed: item.completed,
        })),
      ),
      this.client.from('history_events').upsert(
        data.history.map((item) => ({
          id: item.id,
          task_id: item.taskId ?? null,
          daily_instance_id: item.dailyInstanceId ?? null,
          event_type: item.type,
          occurred_at: item.occurredAt,
          payload: item.payload ?? {},
        })),
      ),
      this.client.from('daily_close_records').upsert(
        data.closeRecords.map((item) => ({
          id: item.id,
          close_date: item.date,
          closed_at: item.closedAt,
          project_minutes: item.projectMinutes,
        })),
      ),
    ]).then((results) => {
      for (const result of results) {
        if (result.error) throw new Error(`Supabase write: ${result.error.message}`);
      }
    });
  }
}

export function createSupabaseWorkspaceRepository(
  url: string,
  anonKey: string,
): SupabaseWorkspaceRepository {
  return new SupabaseWorkspaceRepository(createClient(url, anonKey));
}
