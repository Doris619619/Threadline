/** @fileoverview 首页和详情共用完整阶段任务视图；安排、编辑和完成复用原 Task 命令。 */
'use client';
import { useState, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { TaskActionsPopover } from '@/features/tasks/components/task-actions-popover';
import { TaskDialog, RescheduleDialog } from '@/features/tasks/components/task-dialogs';
import { useTaskCreateAndEdit } from '@/features/tasks/hooks/use-task-create-and-edit';
import { useWorkspaceData } from '@/features/workspace/workspace-data-context';
import { useWorkspaceView } from '@/components/app-shell';
import { useAccountToday } from '@/features/settings/account-timezone-provider';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import { addLocalDateDays } from '@/lib/local-date';
import type { Task } from '@/types/domain';
import { useStagePlans } from './state';
import { stageTaskDateLabel, stageTaskGroups } from './rules';

/** 小型直接操作有独立忙状态和错误，长标题完整换行，不把动作藏进菜单。 */
function StageTaskRow({
  task,
  today,
  onEdit,
  onDate,
  onToday,
  onToggle,
  onRemove,
}: {
  task: Task;
  today: string;
  onEdit: () => void;
  onDate: () => void;
  onToday: () => Promise<void>;
  onToggle: () => Promise<unknown>;
  onRemove: () => Promise<void>;
}) {
  const [menu, setMenu] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const { busy, error, run } = useGuardedAction();
  return (
    <div
      className={'stage-task-row' + (task.completed ? ' is-completed' : '')}
      data-stage-task-id={task.id}
      aria-busy={busy}
    >
      <Checkbox
        checked={task.completed}
        aria-label={(task.completed ? '取消完成 ' : '完成 ') + task.title}
        disabled={busy}
        onChange={() => void run(onToggle)}
      />
      <button className="stage-task-title" type="button" onClick={onEdit}>
        {task.title}
      </button>
      <div className="stage-task-actions">
        {!task.completed && task.status === 'waiting' ? (
          <button
            type="button"
            className="stage-today"
            disabled={busy}
            onClick={() => void run(onToday)}
          >
            → 今天
          </button>
        ) : (
          !task.completed && (
            <time dateTime={task.date}>{stageTaskDateLabel(task.date, today)}</time>
          )
        )}
        <button
          ref={anchor}
          type="button"
          aria-label={task.title + '更多操作'}
          aria-expanded={menu}
          disabled={busy}
          onClick={() => setMenu((open) => !open)}
        >
          <MoreHorizontal size={17} aria-hidden="true" />
        </button>
        {menu && (
          <TaskActionsPopover
            anchor={anchor}
            label={task.title + '阶段任务操作'}
            className="waiting-task-menu"
            role="menu"
            onClose={() => setMenu(false)}
          >
            {!task.completed && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onDate();
                }}
              >
                安排到其他日期
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                onEdit();
              }}
            >
              编辑
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                void run(onRemove);
              }}
            >
              从阶段计划移除
            </button>
          </TaskActionsPopover>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** 三组固定顺序且不截断；详情额外保留已放弃/已删除历史。 */
export function StageTaskList({
  stageId,
  showHistory = false,
}: {
  stageId: string;
  showHistory?: boolean;
}) {
  const data = useWorkspaceData();
  const stages = useStagePlans();
  const today = useAccountToday();
  const { active, setSelectedDate } = useWorkspaceView();
  const [editing, setEditing] = useState<Task>();
  const [dating, setDating] = useState<Task>();
  const groups = stageTaskGroups(data.tasks, stageId);
  const { saveTask } = useTaskCreateAndEdit({
    createTask: data.createTask,
    createProject: data.createProject,
    editing,
    projects: data.projects,
    selectedDate: editing?.date ?? today,
    updateTask: data.saveTaskConfirmed,
  });
  /** 同一 Task 乐观进入日程，首页切回账号今天保证它实际可见。 */
  const scheduleToday = async (task: Task) => {
    if (active === 'home') setSelectedDate(today);
    await data.transitionTask(task.id, 'scheduled', today);
  };
  /** 无日期完成使用现有原子命令；已有日程只修改完成字段。 */
  const toggle = (task: Task) =>
    task.status === 'waiting'
      ? data.completeWaitingTask(task.id, today)
      : data.saveTaskConfirmed({ ...task, completed: !task.completed }, task);
  /** 复用原任务表单；保存失败保留编辑内容。 */
  const save = async (form: FormData) => {
    const error = await saveTask(form);
    if (!error) setEditing(undefined);
    return error;
  };
  /** 安排和改期共用原日期规则，不限制到阶段日期范围内。 */
  const changeDate = async (date: string) => {
    if (!dating) return;
    try {
      await data.transitionTask(
        dating.id,
        dating.status === 'waiting' ? 'scheduled' : 'rescheduled',
        date,
      );
      setDating(undefined);
    } catch (error) {
      return error instanceof Error ? error.message : '安排失败，请重试。';
    }
  };
  return (
    <div className="stage-task-groups">
      {(
        [
          ['waiting', '未安排'],
          ['scheduled', '已安排'],
          ['completed', '已完成'],
        ] as const
      ).map(([key, label]) => (
        <section className="stage-task-group" key={key} aria-label={label}>
          <h3>
            {label}
            <span>{groups[key].length}</span>
          </h3>
          {groups[key].length === 0 && (
            <p className="stage-empty-group">暂无{label}任务</p>
          )}
          {groups[key].map((task) => (
            <StageTaskRow
              key={task.id}
              task={task}
              today={today}
              onEdit={() => setEditing(task)}
              onDate={() => setDating(task)}
              onToday={() => scheduleToday(task)}
              onToggle={() => toggle(task)}
              onRemove={() => stages.remove(stageId, task.id)}
            />
          ))}
        </section>
      ))}
      {groups.history.length > 0 &&
        (showHistory ? (
          <details className="stage-history">
            <summary>历史记录 · {groups.history.length}</summary>
            {groups.history.map((task) => (
              <div className="stage-history-row" key={task.id}>
                <span>{task.title}</span>
                <small>{task.status === 'trashed' ? '已删除' : '已放弃'}</small>
              </div>
            ))}
          </details>
        ) : (
          <p className="stage-history-note">
            另有 {groups.history.length} 条历史记录，可在详情回顾
          </p>
        ))}
      {editing && (
        <TaskDialog
          open
          editing={editing}
          mode={editing.status === 'waiting' ? 'waiting' : 'normal'}
          projects={data.projects}
          onSave={save}
          onClose={() => setEditing(undefined)}
        />
      )}
      {dating && (
        <RescheduleDialog
          task={dating}
          defaultDate={addLocalDateDays(today, 1)}
          onSave={changeDate}
          onClose={() => setDating(undefined)}
        />
      )}
    </div>
  );
}
