/** @fileoverview 展示被冲突中止的最后任务草稿，供用户对照远端并手动重新编辑。 */
import {
  taskEditableFields,
  type TaskConflictDraft,
  type TaskPatch,
} from '@/lib/task-patch';
import type { Project, Task } from '@/types/domain';

const labels: Record<keyof TaskPatch, string> = {
  title: '标题',
  projectId: '项目',
  schedulePendingTime: '待填时间',
  plannedStartTime: '开始时间',
  plannedEndTime: '结束时间',
  plannedDurationMinutes: '预计分钟',
  actualDurationMinutes: '实际分钟',
  completed: '已完成',
  importance: '重要程度',
};
const statusLabels: Record<Task['status'], string> = {
  active: '已安排',
  waiting: '待安排',
  abandoned: '已放弃',
  trashed: '回收站',
};

/** 只显示可供恢复的草稿，不提供绕过并发校验的一键覆盖。清除需要用户主动点击。 */
export function TaskConflictDrafts({
  drafts,
  tasks,
  projects,
  onDismiss,
}: {
  drafts: TaskConflictDraft[];
  tasks: Task[];
  projects: Project[];
  onDismiss: (id: string) => void;
}) {
  /** 将字段值转为可选择、可复制的文本，项目展示名称，缺失值明确标识。 */
  const display = (task: Task | undefined, field: keyof TaskPatch) => {
    if (!task) return '任务不存在或读取尚未确认';
    const value = task[field];
    if (field === 'projectId')
      return projects.find((project) => project.id === value)?.name ?? String(value);
    if (typeof value === 'boolean') return value ? '是' : '否';
    if (field === 'importance') return value === 'important' ? '重要' : '普通';
    return value === undefined ? '未设置' : String(value);
  };
  return drafts.map(({ draft }) => {
    const remote = tasks.find((task) => task.id === draft.id);
    return (
      <details
        key={draft.id}
        className="workspace-sync-error"
        style={{ overflowWrap: 'anywhere' }}
      >
        <summary>保存冲突，查看保留草稿：{draft.title}</summary>
        <p>
          后续排队操作已停止。请对照远端内容，复制需要保留的值后重新打开编辑器。草稿仅保留在本次会话，刷新或退出前请先复制。
        </p>
        <table style={{ width: '100%', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th>字段</th>
              <th>最近确认数据</th>
              <th>本机最后草稿</th>
            </tr>
          </thead>
          <tbody>
            {taskEditableFields.map((field) => (
              <tr key={field}>
                <th scope="row">{labels[field]}</th>
                <td>{display(remote, field)}</td>
                <td>{display(draft, field)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          草稿安排日期：{draft.date ?? '未安排'}；当前安排日期：
          {remote?.date ?? '未安排'}。 草稿状态：{statusLabels[draft.status]}
          ；当前状态：{remote ? statusLabels[remote.status] : '未确认'}。
        </p>
        <button type="button" onClick={() => onDismiss(draft.id)}>
          已处理，清除此草稿
        </button>
      </details>
    );
  });
}
