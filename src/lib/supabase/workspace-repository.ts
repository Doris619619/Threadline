/**
 * @fileoverview 提供 Threadline 细粒度 Supabase 查询、CRUD 与原子 RPC，不执行整工作区 upsert。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Daily, DailyHistoryEntry } from '@/features/daily/types';
import {
  fromDatabaseInstant,
  fromDatabaseWallTime,
  toDatabaseDate,
  toDatabaseWallTime,
} from '@/lib/supabase/time-mapper';
import type {
  CloseRecord,
  HistoryEvent,
  Project,
  Task,
  TaskTimeEntry,
} from '@/types/domain';

export type DailyBundle = {
  dailyByDate: Record<string, Daily[]>;
  dailyTemplates: Daily[];
};

type JsonRecord = Record<string, unknown>;

/** 把 Supabase error 转成包含操作名的稳定异常。 */
function assertResponse<T>(
  operation: string,
  response: { data: T | null; error: { message: string } | null },
): T {
  if (response.error) throw new Error(`${operation}: ${response.error.message}`);
  if (response.data === null) throw new Error(`${operation}: empty response`);
  return response.data;
}

/** 将 project row 映射为 UI 领域对象。 */
function mapProject(row: JsonRecord): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    color: String(row.color),
    status: row.status as Project['status'],
    position: Number(row.position),
    isFallback: Boolean(row.is_fallback),
    createdAt: fromDatabaseInstant(String(row.created_at)) ?? String(row.created_at),
    updatedAt: fromDatabaseInstant(String(row.updated_at)),
    archivedAt: fromDatabaseInstant((row.archived_at as string | null) ?? null),
    deletedAt: fromDatabaseInstant((row.deleted_at as string | null) ?? null),
  };
}

/** 将 task row 映射为显式 date、wall-clock 与 timestamptz 领域对象。 */
function mapTask(row: JsonRecord): Task {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title),
    date: (row.scheduled_date as string | null) ?? undefined,
    schedulePendingTime: Boolean(row.schedule_pending_time),
    plannedStartTime: fromDatabaseWallTime(row.planned_start_time as string | null),
    plannedEndTime: fromDatabaseWallTime(row.planned_end_time as string | null),
    plannedDurationMinutes:
      row.planned_duration_minutes === null
        ? undefined
        : Number(row.planned_duration_minutes),
    actualDurationMinutes:
      row.actual_duration_minutes === null
        ? undefined
        : Number(row.actual_duration_minutes),
    completed: Boolean(row.completed),
    completedAt: fromDatabaseInstant((row.completed_at as string | null) ?? null),
    status: row.status as Task['status'],
    // 迁移前同步下来的旧 row 也必须在领域层获得稳定的默认重要性。
    importance: (row.importance as Task['importance'] | null) ?? 'normal',
    postponedFrom: (row.postponed_from as string | null) ?? undefined,
    postponedTo: (row.postponed_to as string | null) ?? undefined,
    abandonedAt: fromDatabaseInstant((row.abandoned_at as string | null) ?? null),
    deletedAt: fromDatabaseInstant((row.deleted_at as string | null) ?? null),
    createdAt: fromDatabaseInstant(String(row.created_at)) ?? String(row.created_at),
    updatedAt: fromDatabaseInstant(String(row.updated_at)) ?? String(row.updated_at),
  };
}

/** 将按日 task time entry 映射到领域层；受信清理后允许 taskId 为空。 */
function mapTaskTimeEntry(row: JsonRecord): TaskTimeEntry {
  return {
    id: String(row.id),
    taskId: row.task_id === null ? undefined : String(row.task_id),
    projectId: String(row.project_id),
    date: String(row.entry_date),
    minutes: Number(row.minutes),
  };
}

/** 将 UI task 映射成数据库 row；本地墙钟字段绝不经过 Date。 */
function taskRow(task: Task) {
  return {
    id: task.id,
    project_id: task.projectId,
    title: task.title,
    scheduled_date: toDatabaseDate(task.date),
    schedule_pending_time: task.schedulePendingTime ?? false,
    planned_start_time: toDatabaseWallTime(task.plannedStartTime),
    planned_end_time: toDatabaseWallTime(task.plannedEndTime),
    planned_duration_minutes: task.plannedDurationMinutes ?? null,
    actual_duration_minutes: task.actualDurationMinutes ?? null,
    completed: task.completed,
    completed_at: task.completedAt ?? null,
    status: task.status,
    importance: task.importance ?? 'normal',
    postponed_from: toDatabaseDate(task.postponedFrom),
    postponed_to: toDatabaseDate(task.postponedTo),
    abandoned_at: task.abandonedAt ?? null,
    deleted_at: task.deletedAt ?? null,
  };
}

/** 将 Daily 数据库行组合成保持 template identity 的 UI Daily。 */
function mapDailyBundle(
  templates: JsonRecord[],
  templateItems: JsonRecord[],
  entries: JsonRecord[],
  entryItems: JsonRecord[],
): DailyBundle {
  const dailyTemplates = templates.map((template) => ({
    id: String(template.id),
    title: String(template.title),
    active: Boolean(template.is_active),
    deletedAt: fromDatabaseInstant((template.deleted_at as string | null) ?? null),
    actual: 0,
    result: '',
    completed: false,
    children: templateItems
      .filter((item) => item.template_id === template.id)
      .sort((left, right) => Number(left.position) - Number(right.position))
      .map((item) => ({
        id: String(item.id),
        templateItemId: String(item.id),
        title: String(item.title),
        plannedDurationMinutes: Number(item.planned_duration_minutes ?? 0),
        active: Boolean(item.is_active),
        deletedAt: fromDatabaseInstant((item.deleted_at as string | null) ?? null),
        completed: false,
        actual: 0,
      })),
  }));
  const dailyByDate: Record<string, Daily[]> = {};
  for (const entry of entries) {
    const date = String(entry.entry_date);
    (dailyByDate[date] ??= []).push({
      entryId: String(entry.id),
      id: String(entry.template_id),
      title: String(entry.title_snapshot),
      actual: Number(entry.actual_duration_minutes ?? 0),
      result: String(entry.result ?? ''),
      completed: Boolean(entry.completed),
      children: entryItems
        .filter((item) => item.entry_id === entry.id)
        .sort((left, right) => Number(left.position) - Number(right.position))
        .map((item) => ({
          id: String(item.id),
          templateItemId:
            item.template_item_id === null ? undefined : String(item.template_item_id),
          title: String(item.title_snapshot),
          plannedDurationMinutes: Number(item.planned_duration_minutes_snapshot ?? 0),
          completed: Boolean(item.completed),
          actual: Number(item.actual_duration_minutes ?? 0),
        })),
    });
  }
  return { dailyByDate, dailyTemplates };
}

export class SupabaseWorkspaceRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** 原子初始化账号并返回五个 UUID 默认项目。 */
  async initializeWorkspace(): Promise<Project[]> {
    const response = await this.client.rpc('initialize_workspace');
    return (assertResponse('initialize_workspace', response) as JsonRecord[]).map(
      mapProject,
    );
  }

  /** 查询当前 owner 的全部项目。 */
  async listProjects(): Promise<Project[]> {
    const response = await this.client
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('position');
    return (assertResponse('list projects', response) as JsonRecord[]).map(mapProject);
  }

  /** 直接保存一个项目并使用 server-returned row。 */
  async saveProject(project: Project): Promise<Project> {
    const response = await this.client
      .from('projects')
      .upsert({
        id: project.id,
        name: project.name,
        color: project.color,
        status: project.status,
        position: project.position ?? 0,
        is_fallback: project.isFallback ?? false,
        archived_at: project.archivedAt ?? null,
      })
      .select()
      .single();
    return mapProject(assertResponse('save project', response) as JsonRecord);
  }

  /** 修改项目名称与识别色；fallback 约束由 owner-scoped RPC 统一执行。 */
  async updateProjectDetails(
    projectId: string,
    name: string,
    color: string,
  ): Promise<Project> {
    const response = await this.client.rpc('update_project_details', {
      p_project_id: projectId,
      p_name: name,
      p_color: color,
    });
    return mapProject(assertResponse('update project details', response) as JsonRecord);
  }

  /** 归档或恢复非 fallback 项目，保留任务及历史引用。 */
  async setProjectArchived(projectId: string, archived: boolean): Promise<Project> {
    const response = await this.client.rpc('set_project_archived', {
      p_project_id: projectId,
      p_archived: archived,
    });
    return mapProject(assertResponse('set project archived', response) as JsonRecord);
  }

  /** 软删除项目并由数据库把所有当前 task 转至 fallback，绝不改写历史账本。 */
  async softDeleteProject(projectId: string): Promise<Project> {
    const response = await this.client.rpc('soft_delete_project', {
      p_project_id: projectId,
    });
    return mapProject(assertResponse('soft delete project', response) as JsonRecord);
  }

  /** 查询 authoritative all-task identity set，供业务视图和 Annotation reconciliation 共用。 */
  async listTasks(): Promise<Task[]> {
    const response = await this.client.from('tasks').select('*').order('created_at');
    return (assertResponse('list tasks', response) as JsonRecord[]).map(mapTask);
  }

  /** 查询按业务日固定的实际投入；analytics 不能由可变 scheduled_date 推断。 */
  async listTaskTimeEntries(): Promise<TaskTimeEntry[]> {
    const response = await this.client
      .from('task_time_entries')
      .select('*')
      .order('entry_date');
    return (assertResponse('list task time entries', response) as JsonRecord[]).map(
      mapTaskTimeEntry,
    );
  }

  /** 直接保存普通 task 字段并返回数据库触发器更新后的 row。 */
  async saveTask(task: Task): Promise<Task> {
    const response = await this.client
      .from('tasks')
      .upsert(taskRow(task))
      .select()
      .single();
    return mapTask(assertResponse('save task', response) as JsonRecord);
  }

  /** 通过事务命令完成 task transition、history 和 trash workstation 副作用。 */
  async transitionTask(
    taskId: string,
    transition: 'scheduled' | 'rescheduled' | 'waiting' | 'abandoned' | 'trashed',
    targetDate?: string,
  ): Promise<Task> {
    const response = await this.client.rpc('transition_task', {
      p_task_id: taskId,
      p_transition: transition,
      p_target_date: targetDate ?? null,
    });
    return mapTask(assertResponse('transition task', response) as JsonRecord);
  }

  /** 通过数据库原子命令完成待安排任务，确保完成 history 的日期快照正确。 */
  async completeWaitingTask(taskId: string, completedDate: string): Promise<Task> {
    const response = await this.client.rpc('complete_waiting_task', {
      p_task_id: taskId,
      p_completed_date: completedDate,
    });
    return mapTask(assertResponse('complete waiting task', response) as JsonRecord);
  }

  /** 幂等实例化业务日期并重新读取完整 Daily bundle。 */
  async ensureDailyDate(date: string): Promise<DailyBundle> {
    assertResponse(
      'ensure Daily date',
      await this.client.rpc('ensure_daily_entries_for_date', {
        p_entry_date: toDatabaseDate(date),
      }),
    );
    return this.listDailyBundle();
  }

  /** 原子创建长期模板及当前业务日期 entry；终态 child 不得进入模板管理写入。 */
  async createDailyTemplate(daily: Daily, date: string): Promise<void> {
    assertResponse(
      'create Daily template',
      await this.client.rpc('create_daily_template_with_entry', {
        p_template_id: daily.id,
        p_title: daily.title,
        p_items: daily.children.filter((item) => !item.deletedAt).map((item, position) => ({
          id: item.templateItemId ?? item.id ?? crypto.randomUUID(),
          title: item.title,
          position,
          planned_duration_minutes: item.plannedDurationMinutes,
        })),
        p_entry_date: toDatabaseDate(date),
      }),
    );
  }

  /** 查询模板、日期实例及两类 item，并在 mapper 中保持 ID 边界。 */
  async listDailyBundle(): Promise<DailyBundle> {
    const [templates, templateItems, entries, entryItems] = await Promise.all([
      this.client.from('daily_templates').select('*').order('position'),
      this.client.from('daily_template_items').select('*').order('position'),
      this.client.from('daily_entries').select('*').order('entry_date'),
      this.client.from('daily_entry_items').select('*').order('position'),
    ]);
    return mapDailyBundle(
      assertResponse('list Daily templates', templates) as JsonRecord[],
      assertResponse('list Daily template items', templateItems) as JsonRecord[],
      assertResponse('list Daily entries', entries) as JsonRecord[],
      assertResponse('list Daily entry items', entryItems) as JsonRecord[],
    );
  }

  /** 以一个 RPC 原子保存某天 Daily 父字段和全部子项，不修改长期模板。 */
  async saveDailyEntry(daily: Daily): Promise<void> {
    if (!daily.entryId) throw new Error('save Daily entry: missing entryId');
    assertResponse(
      'save Daily entry',
      await this.client.rpc('save_daily_entry_bundle', {
        p_entry_id: daily.entryId,
        p_title: daily.title,
        p_completed: daily.completed,
        p_actual_duration_minutes: daily.actual,
        p_result: daily.result,
        p_items: daily.children.map((item, position) => ({
          id: item.id,
          template_item_id: item.templateItemId ?? null,
          title: item.title,
          position,
          completed: item.completed,
          actual: item.actual,
        })),
      }),
    );
  }

  /** 原子保存模板名称和非删除清单结构；历史 entry 保持既有 snapshot，归档 child 仍保留。 */
  async updateDailyTemplate(daily: Daily): Promise<void> {
    assertResponse(
      'update Daily template',
      await this.client.rpc('update_daily_template_bundle', {
        p_template_id: daily.id,
        p_title: daily.title,
        p_items: daily.children.filter((item) => !item.deletedAt).map((item, position) => ({
          id: item.templateItemId ?? item.id,
          title: item.title,
          position,
          planned_duration_minutes: item.plannedDurationMinutes,
        })),
      }),
    );
  }

  /** 写入或读取同一天唯一的正式 Daily history snapshot。 */
  async recordDaily(
    templateId: string,
    date: string,
    source: 'manual' | 'close_day',
  ): Promise<void> {
    assertResponse(
      'record Daily history',
      await this.client.rpc('record_daily_history', {
        p_template_id: templateId,
        p_entry_date: toDatabaseDate(date),
        p_record_source: source,
      }),
    );
  }

  /** 查询正式 Daily history；普通未记录 entry 由 analytics query 另行合并。 */
  async listDailyHistory(): Promise<DailyHistoryEntry[]> {
    const response = await this.client
      .from('daily_history_entries')
      .select('*')
      .order('recorded_at', { ascending: false });
    return (assertResponse('list Daily history', response) as JsonRecord[]).map(
      (row) => ({
        id: String(row.id),
        dailyId: String(row.template_id),
        date: String(row.entry_date),
        completed: Boolean(row.completed),
        actual: Number(row.actual_duration_minutes ?? 0),
        result: String(row.result ?? ''),
      }),
    );
  }

  /** 将 Daily 整体归档、恢复或软删除；未来 entry 才会受影响。 */
  async setDailyTemplateStatus(
    templateId: string,
    status: 'archive' | 'restore' | 'delete',
  ) {
    assertResponse(
      'set Daily template status',
      await this.client.rpc('set_daily_template_status', {
        p_template_id: templateId,
        p_status: status,
      }),
    );
  }

  /** 将单个 Daily 清单项归档、恢复或软删除，不修改过去 entry snapshot。 */
  async setDailyTemplateItemStatus(
    itemId: string,
    status: 'archive' | 'restore' | 'delete',
  ) {
    assertResponse(
      'set Daily template item status',
      await this.client.rpc('set_daily_template_item_status', {
        p_template_item_id: itemId,
        p_status: status,
      }),
    );
  }

  /** 查询 append-only task history。 */
  async listHistory(): Promise<HistoryEvent[]> {
    const response = await this.client
      .from('history_events')
      .select('*')
      .order('occurred_at', { ascending: false });
    return (assertResponse('list history', response) as JsonRecord[]).map((row) => ({
      id: String(row.id),
      taskId: row.task_id === null ? undefined : String(row.task_id),
      dailyInstanceId:
        row.daily_entry_id === null ? undefined : String(row.daily_entry_id),
      type: String(row.event_type),
      occurredAt:
        fromDatabaseInstant(String(row.occurred_at)) ?? String(row.occurred_at),
      payload: (row.payload as Record<string, string> | null) ?? undefined,
    }));
  }

  /** 普通 append-only event insert；复合状态流转不得调用此方法。 */
  async appendHistory(event: HistoryEvent, task?: Task): Promise<void> {
    assertResponse(
      'append history',
      await this.client
        .from('history_events')
        .insert({
          id: event.id,
          task_id: event.taskId ?? null,
          daily_entry_id: event.dailyInstanceId ?? null,
          event_type: event.type,
          occurred_at: event.occurredAt,
          payload: event.payload ?? {},
          task_title_snapshot: task?.title ?? null,
          project_id_snapshot: task?.projectId ?? null,
          task_date_snapshot: task?.date ?? null,
        })
        .select()
        .single(),
    );
  }

  /** 查询每日收尾记录。 */
  async listCloseRecords(): Promise<CloseRecord[]> {
    const response = await this.client
      .from('daily_close_records')
      .select('*')
      .order('close_date', { ascending: false });
    return (assertResponse('list close records', response) as JsonRecord[]).map(
      (row) => ({
        id: String(row.id),
        date: String(row.close_date),
        closedAt: fromDatabaseInstant(String(row.closed_at)) ?? String(row.closed_at),
        projectMinutes: (row.project_minutes as Record<string, number> | null) ?? {},
      }),
    );
  }

  /** 原子完成未完成任务流转、正式 Daily 记录与 close record 写入。 */
  async closeDay(
    date: string,
    actions: Array<{
      taskId: string;
      action: 'tomorrow' | 'date' | 'waiting' | 'abandoned';
      targetDate?: string;
    }>,
    projectMinutes: Record<string, number>,
  ): Promise<CloseRecord> {
    const row = assertResponse(
      'close day',
      await this.client.rpc('close_day', {
        p_close_date: toDatabaseDate(date),
        p_actions: actions.map((action) => ({
          task_id: action.taskId,
          action: action.action,
          target_date: toDatabaseDate(action.targetDate),
        })),
        p_project_minutes: projectMinutes,
      }),
    ) as JsonRecord;
    return {
      id: String(row.id),
      date: String(row.close_date),
      closedAt: fromDatabaseInstant(String(row.closed_at)) ?? String(row.closed_at),
      projectMinutes: (row.project_minutes as Record<string, number> | null) ?? {},
    };
  }

  /** 返回当前 active workstation task IDs。 */
  async listWorkstationTaskIds(): Promise<string[]> {
    const response = await this.client
      .from('workstation_entries')
      .select('task_id,position')
      .is('removed_at', null)
      .order('position');
    return (assertResponse('list workstation', response) as JsonRecord[]).map((row) =>
      String(row.task_id),
    );
  }

  /** 原子添加或重新加入工作站末尾。 */
  async addWorkstationTask(taskId: string): Promise<void> {
    assertResponse(
      'add workstation task',
      await this.client.rpc('add_workstation_task', { p_task_id: taskId }),
    );
  }

  /** 软移除 membership，并确保 position 变为 null。 */
  async removeWorkstationTask(taskId: string): Promise<void> {
    const response = await this.client
      .from('workstation_entries')
      .update({ removed_at: new Date().toISOString(), position: null })
      .eq('task_id', taskId)
      .select();
    assertResponse('remove workstation task', response);
  }

  /** 原子提交完整工作站顺序。 */
  async reorderWorkstation(taskIds: string[]): Promise<void> {
    assertResponse(
      'reorder workstation',
      await this.client.rpc('reorder_workstation', { p_task_ids: taskIds }),
    );
  }

  /** 查询 Rhythm 日期标记。 */
  async listRhythmMarks(): Promise<Record<string, boolean>> {
    const response = await this.client.from('rhythm_marks').select('*');
    return Object.fromEntries(
      (assertResponse('list Rhythm', response) as JsonRecord[]).map((row) => [
        String(row.mark_date),
        Boolean(row.marked),
      ]),
    );
  }

  /** 用单行 upsert 切换 Rhythm，不依赖 DELETE payload。 */
  async saveRhythmMark(
    date: string,
    marked: boolean,
  ): Promise<{ date: string; marked: boolean }> {
    const row = assertResponse(
      'save Rhythm',
      await this.client
        .from('rhythm_marks')
        .upsert(
          { mark_date: toDatabaseDate(date), marked },
          { onConflict: 'owner_id,mark_date' },
        )
        .select()
        .single(),
    ) as JsonRecord;
    return { date: String(row.mark_date), marked: Boolean(row.marked) };
  }
}
