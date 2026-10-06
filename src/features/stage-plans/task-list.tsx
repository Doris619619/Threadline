/** @fileoverview 首页状态清单、经典原版分区和新版合并明细共用原 Task 命令与单框估时。 */
'use client';
import { useState } from 'react';

import { TaskDialog, RescheduleDialog } from '@/features/tasks/components/task-dialogs';
import { useTaskCreateAndEdit } from '@/features/tasks/hooks/use-task-create-and-edit';
import { useWorkspaceData } from '@/features/workspace/workspace-data-context';
import { useWorkspaceView } from '@/components/app-shell';
import { useAccountToday } from '@/features/settings/account-timezone-provider';

import { addLocalDateDays } from '@/lib/local-date';
import type { Task } from '@/types/domain';
import { useStagePlans } from './state';
import { stageTaskGroups } from './rules';
import { PlanTaskRow } from './task-row';
import { formatMinutes } from '@/features/tasks/task-time';
import { stageProjectGroups } from './project-groups';
import { TaskEstimateEditor } from './task-estimate-editor';
import { TimeTaskList } from './time-task-list';
import type { StageTimeView } from './time-view';

/** 经典按原顺序平铺三种状态并保留项目标签，只有新版合并到项目时间明细。 */
export function StageTaskList({
  stageId,
  showHistory = false,
  timeView,
  classic = false,
}: {
  stageId: string;
  showHistory?: boolean;
  timeView?: StageTimeView;
  classic?: boolean;
}) {
  const data = useWorkspaceData();
  const stages = useStagePlans();
  const today = useAccountToday();
  const { active, setSelectedDate } = useWorkspaceView();
  const [editing, setEditing] = useState<Task>();
  const [dating, setDating] = useState<Task>();
  const groups = stageTaskGroups(data.tasks, stageId);
  const unified = !!timeView && !classic;
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
  /** 经典估时放回标题下方，新版固定日期/时长列；共享确认保存但不改变旧版行布局。 */
  const renderTask = (task: Task) => {
    const actual = unified && timeView?.metric === 'actual';
    const estimate = (
      <TaskEstimateEditor
        key={actual ? 'actual' : 'planned'}
        task={task}
        today={today}
        metric={actual ? 'actual' : 'planned'}
        displayLabel={
          unified && !actual && task.plannedDurationMinutes === undefined
            ? '暂定'
            : undefined
        }
        disabled={timeView?.saving}
        onSave={
          timeView
            ? actual
              ? timeView.saveActual
              : timeView.saveEstimate
            : (original, minutes) =>
                data.saveTaskConfirmed(
                  { ...original, plannedDurationMinutes: minutes },
                  original,
                )
        }
      />
    );
    return (
      <PlanTaskRow
        key={task.id}
        task={task}
        today={today}
        timeColumns={unified}
        project={
          !classic && (timeView || (task.status === 'waiting' && !task.completed))
            ? undefined
            : data.projects.find((project) => project.id === task.projectId)
        }
        estimate={classic ? undefined : estimate}
        metadata={
          classic && task.plannedDurationMinutes !== undefined ? (
            <>
              <span>预计</span>
              {estimate}
            </>
          ) : undefined
        }
        selected={unified && timeView?.selected === task.id}
        disabled={timeView?.saving}
        onSelect={unified ? () => timeView.select(task.id) : undefined}
        onHover={
          unified
            ? (hovered) => timeView.hover(hovered ? task.id : undefined)
            : undefined
        }
        onEdit={() => setEditing(task)}
        onDate={() => setDating(task)}
        onToday={unified ? undefined : () => scheduleToday(task)}
        onToggle={() => toggle(task)}
        onRemove={() => stages.remove(stageId, task.id)}
      />
    );
  };
  return (
    <div
      className={
        unified
          ? 'stage-time-list-pane'
          : 'stage-task-groups' + (classic ? ' stage-classic-task-groups' : '')
      }
    >
      {unified ? (
        <TimeTaskList
          tasks={data.tasks.filter(
            (task) =>
              task.stagePlanId === stageId &&
              !task.deletedAt &&
              task.status !== 'trashed' &&
              task.status !== 'abandoned',
          )}
          projects={data.projects}
          view={timeView}
          renderTask={renderTask}
        />
      ) : (
        (
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
            {key === 'waiting' && !classic
              ? stageProjectGroups(groups.waiting, data.projects).map((group) => (
                  <details
                    key={group.id}
                    open
                    className="stage-waiting-project"
                    data-stage-project-id={group.id}
                    aria-label={(group.project?.name ?? '未知项目') + '未安排任务'}
                  >
                    <summary>
                      <i
                        aria-hidden="true"
                        style={{
                          background: group.project?.color ?? 'var(--text-secondary)',
                        }}
                      />
                      <span>{group.project?.name ?? '未知项目'}</span>
                      <small>{group.tasks.length} 项</small>
                      <strong>
                        {group.tasks.some(
                          (task) => task.plannedDurationMinutes !== undefined,
                        )
                          ? formatMinutes(
                              group.tasks.reduce(
                                (sum, task) => sum + (task.plannedDurationMinutes ?? 0),
                                0,
                              ),
                            )
                          : '未估时'}
                      </strong>
                    </summary>
                    {group.tasks.map(renderTask)}
                  </details>
                ))
              : groups[key].map(renderTask)}
          </section>
        ))
      )}
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
