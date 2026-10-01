/** @fileoverview 阶段的分页查询和事务 RPC；任务回包沿用原 Task mapper。 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapTask } from '@/lib/supabase/workspace-repository';
import { readAllRows } from '@/lib/supabase/pagination';
import { fromDatabaseVersionInstant } from '@/lib/supabase/time-mapper';
import type { StagePlan, Task } from '@/types/domain';
import type { StagePlanChanges, StagePlanDraft, StageTaskDraft } from './rules';

type Row = Record<string, unknown>;
/** 保留精确版本时间戳，用于跨端受检编辑。 */
export function mapStagePlan(row: Row): StagePlan {
  return {
    id: String(row.id),
    name: String(row.name),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    homeVisible: Boolean(row.home_visible),
    createdAt: String(row.created_at),
    updatedAt: fromDatabaseVersionInstant(String(row.updated_at))!,
    deletedAt: (row.deleted_at as string | null) ?? undefined,
  };
}
/** 将错误归一到表单可显示的文案，缺少迁移时不退回另一份本地数据。 */
function checked(result: {
  data: unknown;
  error: { message: string } | null;
}): unknown {
  if (result.error) {
    if (result.error.message.includes('STAGE_CONFLICT'))
      throw new Error('阶段已在其他设备修改，请重新查看后保存。草稿已保留。');
    if (result.error.message.includes('STAGE_NOT_FOUND'))
      throw new Error('阶段已删除或不可用，请重新加载。');
    throw new Error('阶段保存失败：' + result.error.message);
  }
  if (!result.data) throw new Error('阶段保存失败：没有返回确认结果。');
  return result.data;
}
/** 每个命令只发送一次；事务回包直接更新缓存，刷新失败不被误报为创建失败。 */
export class StagePlanRepository {
  constructor(private readonly client: SupabaseClient) {}
  /** 读取全部未删除阶段，避免 Supabase 默认行数上限截断历史。 */
  async list(signal?: AbortSignal): Promise<StagePlan[]> {
    return (
      await readAllRows(this.client, 'stage_plans', {
        signal,
        sort: 'created_at',
        nullColumn: 'deleted_at',
      })
    ).map(mapStagePlan);
  }
  /** 原子创建阶段和首批真实任务，稳定 ID 保证重试不重复。 */
  async create(draft: StagePlanDraft): Promise<{ plan: StagePlan; tasks: Task[] }> {
    const data = checked(
      await this.client.rpc('create_stage_plan', {
        p_id: draft.id,
        p_name: draft.name,
        p_start_date: draft.startDate,
        p_end_date: draft.endDate,
        p_home_visible: draft.homeVisible,
        p_tasks: draft.tasks,
      }),
    ) as { plan: Row; tasks: Row[] };
    return { plan: mapStagePlan(data.plan), tasks: data.tasks.map(mapTask) };
  }
  /** 只提交明确改变的元数据；精确版本阻止旧表单覆盖新值。 */
  async update(plan: StagePlan, changes: StagePlanChanges): Promise<StagePlan> {
    const names = {
      name: 'name',
      startDate: 'start_date',
      endDate: 'end_date',
      homeVisible: 'home_visible',
    };
    return mapStagePlan(
      checked(
        await this.client.rpc('update_stage_plan', {
          p_id: plan.id,
          p_expected_updated_at: plan.updatedAt,
          p_changes: Object.fromEntries(
            Object.entries(changes).map(([key, value]) => [
              names[key as keyof typeof names],
              value,
            ]),
          ),
        }),
      ) as Row,
    );
  }
  /** 追加仍未安排的 Task；任务 ID 在失败重试时保持不变。 */
  async append(stageId: string, task: StageTaskDraft): Promise<Task> {
    return mapTask(
      checked(
        await this.client.rpc('append_stage_task', {
          p_stage_id: stageId,
          p_task_id: task.id,
          p_title: task.title,
        }),
      ) as Row,
    );
  }
  /** 清除阶段归属而不删除任务。 */
  async remove(stageId: string, taskId: string): Promise<Task> {
    return mapTask(
      checked(
        await this.client.rpc('remove_stage_task', {
          p_stage_id: stageId,
          p_task_id: taskId,
        }),
      ) as Row,
    );
  }
  /** 原子软删除阶段并释放任务；日程、项目和账本保持原值。 */
  async delete(plan: StagePlan): Promise<StagePlan> {
    return mapStagePlan(
      checked(
        await this.client.rpc('soft_delete_stage_plan', {
          p_id: plan.id,
          p_expected_updated_at: plan.updatedAt,
        }),
      ) as Row,
    );
  }
}
