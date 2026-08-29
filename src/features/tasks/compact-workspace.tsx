/** @fileoverview 渲染迷你今日与工作站的高密度任务视图，并维护紧凑新增、引用和排序交互。 */

'use client';

import { GripVertical, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ProjectTag } from '@/components/ui/project-tag';
import type {
  CompactQuickTaskDraft,
  CompactTimedTaskDraft,
} from '@/features/tasks/task-drafts';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import type { Project, Task } from '@/types/domain';

export type { CompactQuickTaskDraft, CompactTimedTaskDraft } from '@/features/tasks/task-drafts';

type CompactWorkspaceProps = {
  timed: Task[];
  quick: Task[];
  projects: Project[];
  workstationTaskIds: string[];
  onUpdateTask: (task: Task) => void;
  onToggleWorkstation: (taskId: string) => void;
  onClearWorkstation: () => void;
  onReorderWorkstation: (sourceId: string, targetId: string) => void;
  onCreateTimedTask: (draft: CompactTimedTaskDraft) => void;
  onCreateQuickTask: (draft: CompactQuickTaskDraft) => void;
};

/** 从动态项目集合解析任务项目；历史缺失项目保留可读的其他标签。 */
function findProject(task: Task, projects: Project[]): Project {
  return (
    projects.find((project) => project.id === task.projectId) ?? {
      id: 'missing',
      name: '其他',
      color: '#8793a7',
      status: 'active',
      createdAt: '',
    }
  );
}

/** 将任务时间压缩为参考图中的单列范围，不额外显示独立时长。 */
function formatCompactTime(task: Task): string {
  if (!task.plannedStartTime) return '—';
  return `${task.plannedStartTime}${task.plannedEndTime ? `–${task.plannedEndTime}` : ''}`;
}

/** 渲染可复用的紧凑项目标签与任务标题，始终保持同一视觉行。 */
function CompactTaskLabel({
  task,
  projects,
}: Pick<CompactWorkspaceProps, 'projects'> & { task: Task }) {
  const project = findProject(task, projects);
  return (
    <span className="compact-task-label">
      <ProjectTag name={project.name} color={project.color} />
      <strong title={task.title}>{task.title}</strong>
    </span>
  );
}

/** 渲染迷你今日中的单行排程任务，并保留完成和工作站引用操作。 */
function MiniScheduleRow({
  task,
  projects,
  inWorkstation,
  onUpdateTask,
  onToggleWorkstation,
}: Pick<CompactWorkspaceProps, 'projects' | 'onUpdateTask' | 'onToggleWorkstation'> & {
  task: Task;
  inWorkstation: boolean;
}) {
  return (
    <li className={`mini-task-row${task.completed ? ' completed' : ''}`}>
      <time>{formatCompactTime(task)}</time>
      <Checkbox
        aria-label={`完成${task.title}`}
        checked={task.completed}
        onChange={(event) =>
          onUpdateTask({
            ...task,
            completed: event.target.checked,
            completedAt: event.target.checked ? new Date().toISOString() : undefined,
            updatedAt: new Date().toISOString(),
          })
        }
      />
      <CompactTaskLabel task={task} projects={projects} />
      <button
        type="button"
        className={`workstation-toggle${inWorkstation ? 'is-active' : ''}`}
        aria-label={`${inWorkstation ? '从工作站移除' : '加入工作站'}${task.title}`}
        title={inWorkstation ? '从工作站移除' : '加入工作站'}
        onClick={() => onToggleWorkstation(task.id)}
      >
        <Plus size={16} />
      </button>
    </li>
  );
}

/** 渲染迷你今日中的单行无时间待办，并维持与排程任务一致的操作密度。 */
function MiniQuickRow({
  task,
  projects,
  inWorkstation,
  onUpdateTask,
  onToggleWorkstation,
}: Pick<CompactWorkspaceProps, 'projects' | 'onUpdateTask' | 'onToggleWorkstation'> & {
  task: Task;
  inWorkstation: boolean;
}) {
  return (
    <li className={`mini-quick-row${task.completed ? ' completed' : ''}`}>
      <Checkbox
        aria-label={`完成${task.title}`}
        checked={task.completed}
        onChange={(event) =>
          onUpdateTask({
            ...task,
            completed: event.target.checked,
            completedAt: event.target.checked ? new Date().toISOString() : undefined,
            updatedAt: new Date().toISOString(),
          })
        }
      />
      <CompactTaskLabel task={task} projects={projects} />
      <button
        type="button"
        className={`workstation-toggle${inWorkstation ? 'is-active' : ''}`}
        aria-label={`${inWorkstation ? '从工作站移除' : '加入工作站'}${task.title}`}
        title={inWorkstation ? '从工作站移除' : '加入工作站'}
        onClick={() => onToggleWorkstation(task.id)}
      >
        <Plus size={16} />
      </button>
    </li>
  );
}

/** 以最少字段新增日程任务，结束时间仅在晚于开始时间时才会提交。 */
function CompactTimedAddRow({
  projects,
  onCreate,
}: {
  projects: Project[];
  onCreate: (draft: CompactTimedTaskDraft) => void;
}) {
  const [projectId, setProjectId] = useState(() => projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState<string>();
  /** 验证紧凑行时间并在成功后将字段交给 Dashboard 统一持久化。 */
  const submit = () => {
    if (!title.trim()) return setError('请输入任务名称');
    if (end && (!start || end <= start)) return setError('结束时间需晚于开始时间');
    onCreate({
      projectId,
      title: title.trim(),
      start: start || undefined,
      end: end || undefined,
    });
  };
  return (
    <li className="compact-add-row compact-timed-add-row">
      <div className="compact-add-time">
        <input
          aria-label="紧凑新增开始时间"
          type="time"
          value={start}
          onChange={(event) => {
            setStart(event.target.value);
            setError(undefined);
          }}
        />
        <span>→</span>
        <input
          aria-label="紧凑新增结束时间"
          type="time"
          value={end}
          onChange={(event) => {
            setEnd(event.target.value);
            setError(undefined);
          }}
        />
      </div>
      <select
        aria-label="紧凑新增日程项目"
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
      >
        {projects
          .filter((project) => project.status === 'active')
          .map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
      </select>
      <input
        aria-label="紧凑新增日程任务"
        placeholder="任务名称"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setError(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
      />
      <button
        type="button"
        className="compact-add-confirm"
        aria-label="保存日程任务"
        onClick={submit}
      >
        <Plus size={16} />
      </button>
      {error && <span className="compact-add-error">{error}</span>}
    </li>
  );
}

/** 以项目和标题新增无时间待办，避免在小组件中打开大弹窗。 */
function CompactQuickAddRow({
  projects,
  onCreate,
}: {
  projects: Project[];
  onCreate: (draft: CompactQuickTaskDraft) => void;
}) {
  const [projectId, setProjectId] = useState(() => projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string>();
  /** 阻止空标题写入，并将有效的轻量草稿交由 Dashboard 创建。 */
  const submit = () => {
    if (!title.trim()) return setError('请输入任务名称');
    onCreate({ projectId, title: title.trim() });
  };
  return (
    <li className="compact-add-row compact-quick-add-row">
      <select
        aria-label="紧凑新增待办项目"
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
      >
        {projects
          .filter((project) => project.status === 'active')
          .map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
      </select>
      <input
        aria-label="紧凑新增待办任务"
        placeholder="待办内容"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setError(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
      />
      <button
        type="button"
        className="compact-add-confirm"
        aria-label="保存待办任务"
        onClick={submit}
      >
        <Plus size={16} />
      </button>
      {error && <span className="compact-add-error">{error}</span>}
    </li>
  );
}

/** 渲染目标图比例的迷你今日，提供日程与无时间待办的真实 inline 新增。 */
export function MiniTodayPanel(props: CompactWorkspaceProps) {
  const { setMode } = useDesktopWindow();
  const [addingTimed, setAddingTimed] = useState(false);
  const [addingQuick, setAddingQuick] = useState(false);
  const has = (id: string) => props.workstationTaskIds.includes(id);
  return (
    <section
      className="compact-workspace mini-today-panel"
      data-testid="mini-today-panel"
    >
      <section className="compact-section">
        <header>
          <h2>今日日程</h2>
          <button
            type="button"
            className="compact-add-trigger"
            onClick={() => setAddingTimed(true)}
          >
            <Plus size={17} /> 添加
          </button>
        </header>
        <ul>
          {props.timed.map((task) => (
            <MiniScheduleRow
              key={task.id}
              task={task}
              projects={props.projects}
              inWorkstation={has(task.id)}
              onUpdateTask={props.onUpdateTask}
              onToggleWorkstation={props.onToggleWorkstation}
            />
          ))}
          {addingTimed && (
            <CompactTimedAddRow
              projects={props.projects}
              onCreate={(draft) => {
                props.onCreateTimedTask(draft);
                setAddingTimed(false);
              }}
            />
          )}
          {!props.timed.length && !addingTimed && (
            <li className="compact-empty">今天还没有已排程任务。</li>
          )}
        </ul>
      </section>
      <section className="compact-section">
        <header>
          <h2>无时间待办</h2>
          <button
            type="button"
            className="compact-add-trigger"
            onClick={() => setAddingQuick(true)}
          >
            <Plus size={17} /> 添加
          </button>
        </header>
        <ul>
          {props.quick.map((task) => (
            <MiniQuickRow
              key={task.id}
              task={task}
              projects={props.projects}
              inWorkstation={has(task.id)}
              onUpdateTask={props.onUpdateTask}
              onToggleWorkstation={props.onToggleWorkstation}
            />
          ))}
          {addingQuick && (
            <CompactQuickAddRow
              projects={props.projects}
              onCreate={(draft) => {
                props.onCreateQuickTask(draft);
                setAddingQuick(false);
              }}
            />
          )}
          {!props.quick.length && !addingQuick && (
            <li className="compact-empty">暂无未定时间待办。</li>
          )}
        </ul>
      </section>
      <button
        type="button"
        className="compact-full-link"
        onClick={() => void setMode('full')}
      >
        打开完整工作台
      </button>
    </section>
  );
}

/** 渲染可排序的工作站 task-ID 引用，移除只影响引用集合而不改任务。 */
function WorkstationRow({
  task,
  index,
  projects,
  onRemove,
  onReorder,
}: {
  task: Task;
  index: number;
  projects: Project[];
  onRemove: (id: string) => void;
  onReorder: (sourceId: string, targetId: string) => void;
}) {
  return (
    <li
      className="workstation-row"
      draggable
      onDragStart={(event) =>
        event.dataTransfer.setData('text/workstation-task-id', task.id)
      }
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const source = event.dataTransfer.getData('text/workstation-task-id');
        if (source) onReorder(source, task.id);
      }}
    >
      <span className="workstation-order">{index + 1}</span>
      <CompactTaskLabel task={task} projects={projects} />
      <GripVertical className="workstation-grip" size={15} aria-hidden="true" />
      <button
        type="button"
        className="workstation-remove"
        aria-label={`从工作站移除${task.title}`}
        title="仅从工作站移除"
        onClick={() => onRemove(task.id)}
      >
        <X size={15} />
      </button>
    </li>
  );
}

/** 通过有序 task ID 解析工作站，并由上层唯一 header 提供清空与模式操作。 */
export function WorkstationPanel({
  tasks,
  projects,
  workstationTaskIds,
  onToggleWorkstation,
  onReorderWorkstation,
}: Pick<
  CompactWorkspaceProps,
  'projects' | 'workstationTaskIds' | 'onToggleWorkstation' | 'onReorderWorkstation'
> & { tasks: Task[] }) {
  const { setMode } = useDesktopWindow();
  const items = workstationTaskIds
    .map((id) => tasks.find((task) => task.id === id))
    .filter((task): task is Task => Boolean(task));
  return (
    <section
      className="compact-workspace workstation-panel"
      data-testid="workstation-panel"
    >
      <ol>
        {items.length ? (
          items.map((task, index) => (
            <WorkstationRow
              key={task.id}
              task={task}
              index={index}
              projects={projects}
              onRemove={onToggleWorkstation}
              onReorder={onReorderWorkstation}
            />
          ))
        ) : (
          <li className="compact-empty">
            加入几件正在推进的任务，它们会一直留在这里。
          </li>
        )}
      </ol>
      <button
        type="button"
        className="compact-full-link"
        onClick={() => void setMode('full')}
      >
        打开完整工作台
      </button>
    </section>
  );
}
