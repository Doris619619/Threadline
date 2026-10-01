/** @fileoverview 完整项目任务总览：所有日期、阶段和状态共用原 Task，筛选搜索与原编辑/改期/完成命令。 */
'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MoreHorizontal, Search } from 'lucide-react';
import type { Project, Task } from '@/types/domain';
import { PlanObjectIcon } from '@/features/stage-plans/object-icon';
import { PlanTaskRow } from '@/features/stage-plans/task-row';
import { useOptionalStagePlans } from '@/features/stage-plans/state';
import { useWorkspaceData } from '@/features/workspace/workspace-data-context';
import { useAccountToday } from '@/features/settings/account-timezone-provider';
import { useTaskCreateAndEdit } from '@/features/tasks/hooks/use-task-create-and-edit';
import { TaskDialog, RescheduleDialog } from '@/features/tasks/components/task-dialogs';
import { addLocalDateDays } from '@/lib/local-date';
import {
  filterProjectTasks,
  projectTasks,
  projectTaskState,
  projectTaskFilters,
  type ProjectTaskFilter,
} from './project-task-rules';

/** 默认展示完整集合，包括保留的放弃/回收站记录；每个 Task 只占一行，历史项保持只读。 */
export function ProjectDetail({
  project,
  onBack,
  onManage,
}: {
  project: Project;
  onBack: () => void;
  onManage: () => void;
}) {
  const data = useWorkspaceData();
  const stages = useOptionalStagePlans();
  const today = useAccountToday();
  const [filter, setFilter] = useState<ProjectTaskFilter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Task>();
  const [dating, setDating] = useState<Task>();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const tasks = projectTasks(data.tasks, project.id);
  const visible = filterProjectTasks(tasks, filter, search);
  const { saveTask } = useTaskCreateAndEdit({
    createTask: data.createTask,
    createProject: data.createProject,
    editing,
    projects: data.projects,
    selectedDate: editing?.date ?? today,
    updateTask: data.saveTaskConfirmed,
  });
  /** 保留原表单校验及失败草稿；保存成功才关闭，项目或状态变化立即反映到总览。 */
  const save = async (form: FormData) => {
    const error = await saveTask(form);
    if (!error) setEditing(undefined);
    return error;
  };
  /** 复用普通任务流转，阶段归属和项目不变；日期失败保留改期弹窗。 */
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
  /** 无日期完成使用原原子命令，其他有效项只切换原 Task 的完成字段。 */
  const toggle = (task: Task) =>
    task.status === 'waiting'
      ? data.completeWaitingTask(task.id, today)
      : data.saveTaskConfirmed({ ...task, completed: !task.completed }, task);
  return (
    <section className="project-detail" aria-label={'项目任务 ' + project.name}>
      <button className="stage-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" />
        返回计划
      </button>
      <header className="project-detail-heading">
        <div>
          <h1 ref={heading} tabIndex={-1}>
            <PlanObjectIcon kind="project" name={project.name} />
            {project.name}
          </h1>
          <p>
            {tasks.length} 个任务{project.status === 'archived' ? ' · 已归档' : ''}
          </p>
        </div>
        <button className="plan-create-link" type="button" onClick={onManage}>
          <MoreHorizontal size={18} aria-hidden="true" />
          管理项目
        </button>
      </header>
      <div className="project-detail-toolbar">
        <div className="project-task-filters" aria-label="项目任务筛选" role="group">
          {projectTaskFilters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}{' '}
              <span>
                {value === 'all'
                  ? tasks.length
                  : tasks.filter((task) => projectTaskState(task) === value).length}
              </span>
            </button>
          ))}
        </div>
        <label className="plan-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索项目任务"
            placeholder="搜索任务…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className="project-detail-list" aria-label="项目任务列表">
        {visible.map((task) => {
          const state = projectTaskState(task);
          const label = projectTaskFilters.find(([value]) => value === state)![1];
          const stage = stages?.plans.find((plan) => plan.id === task.stagePlanId);
          const metadata = (
            <>
              <span>{label}</span>
              {stage && <span>{stage.name}</span>}
              {task.plannedDurationMinutes !== undefined && (
                <span>预计 {task.plannedDurationMinutes} 分钟</span>
              )}
            </>
          );
          return state === 'trashed' || state === 'abandoned' ? (
            <div
              className="project-task-history"
              key={task.id}
              data-project-task-id={task.id}
            >
              <span className="project-history-mark" aria-hidden="true">
                –
              </span>
              <div>
                <span>{task.title}</span>
                <div className="plan-task-meta">{metadata}</div>
              </div>
            </div>
          ) : (
            <div key={task.id} data-project-task-id={task.id}>
              <PlanTaskRow
                task={task}
                today={today}
                metadata={metadata}
                onEdit={() => setEditing(task)}
                onDate={() => setDating(task)}
                onToday={async () => {
                  await data.transitionTask(task.id, 'scheduled', today);
                }}
                onToggle={() => toggle(task)}
              />
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="plan-empty">
            {tasks.length === 0
              ? '这个项目还没有任务。添加任务时选择此项目，就会在这里汇总。'
              : '没有符合筛选条件的任务。'}
          </p>
        )}
      </div>
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
    </section>
  );
}
