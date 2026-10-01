/** @fileoverview 阶段日期、任务分组与普通待安排的纯规则；不复制任务或持久化结束状态。 */
import { addLocalDateDays, parseLocalDateKey } from '@/lib/local-date';
import type { StagePlan, Task } from '@/types/domain';

export type StageStatus = 'active' | 'upcoming' | 'past';
export type StageTaskDraft = { id: string; title: string; projectId?: string };
export type StagePlanDraft = Pick<
  StagePlan,
  'id' | 'name' | 'startDate' | 'endDate' | 'homeVisible'
> & {
  tasks: StageTaskDraft[];
};
export type StagePlanChanges = Partial<
  Pick<StagePlan, 'name' | 'startDate' | 'endDate' | 'homeVisible'>
>;

/** 使用账号自然日判定，结束日期包含在进行中范围内。 */
export function stageStatus(plan: StagePlan, today: string): StageStatus {
  return today > plan.endDate ? 'past' : today < plan.startDate ? 'upcoming' : 'active';
}

/** 结束只隐藏视图，不修改首页意愿；延长日期后可再次显示。 */
export function visibleHomeStages(plans: StagePlan[], today: string): StagePlan[] {
  return plans
    .filter(
      (plan) =>
        !plan.deletedAt && plan.homeVisible && stageStatus(plan, today) !== 'past',
    )
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
}

/** 阶段内待执行和普通长期待安排共用 waiting 状态，但属于不同视图。 */
export function isGeneralWaitingTask(task: Task): boolean {
  return task.status === 'waiting' && !task.completed && !task.stagePlanId;
}

/** 只从原 Task 派生三组；取消和回收站保留在独立回顾区，不计入执行进度。 */
export function stageTaskGroups(tasks: Task[], stageId: string) {
  const members = tasks.filter((task) => task.stagePlanId === stageId);
  const retained = members.filter(
    (task) => task.status !== 'trashed' && task.status !== 'abandoned',
  );
  const waiting = retained.filter(
    (task) => !task.completed && task.status === 'waiting',
  );
  const scheduled = retained
    .filter((task) => !task.completed && task.status === 'active')
    .sort(
      (a, b) =>
        (a.date ?? '').localeCompare(b.date ?? '') ||
        a.createdAt.localeCompare(b.createdAt),
    );
  const completed = retained.filter((task) => task.completed);
  const history = members.filter(
    (task) => task.status === 'trashed' || task.status === 'abandoned',
  );
  return { waiting, scheduled, completed, history, total: retained.length };
}

/** 以日历日期序数计算差值，避免夏令时的 23/25 小时日导致少算一天。 */
function daysBetween(from: string, to: string): number {
  parseLocalDateKey(from);
  parseLocalDateKey(to);
  return Math.round(
    (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000,
  );
}

/** 统一首页及详情的时间距离文案。 */
export function stageTimingLabel(plan: StagePlan, today: string): string {
  const status = stageStatus(plan, today);
  if (status === 'past') return '已结束';
  if (status === 'upcoming') return daysBetween(today, plan.startDate) + ' 天后开始';
  const remaining = daysBetween(today, plan.endDate);
  return remaining === 0 ? '今天结束' : '还有 ' + remaining + ' 天';
}

/** 相对账号今天标记日期；跨年时补充年份，历史日期不伪装为今天。 */
export function stageTaskDateLabel(date: string | undefined, today: string): string {
  if (!date) return '日期待定';
  if (date === today) return '今天';
  if (date === addLocalDateDays(today, 1)) return '明天';
  const [year, month, day] = date.split('-');
  return (
    (year !== today.slice(0, 4) ? year + '年' : '') +
    Number(month) +
    '月' +
    Number(day) +
    '日'
  );
}

/** 提交前验证名称和真实日期；数据库重复校验以保护跨端写入。 */
export function validateStageDraft(
  draft: Pick<StagePlanDraft, 'name' | 'startDate' | 'endDate'>,
): string | undefined {
  if (!draft.name.trim() || draft.name.trim().length > 80)
    return '阶段名称需要 1–80 个字符。';
  try {
    parseLocalDateKey(draft.startDate);
    parseLocalDateKey(draft.endDate);
  } catch {
    return '请选择有效的开始和结束日期。';
  }
  if (draft.endDate < draft.startDate) return '结束日期不能早于开始日期。';
}
