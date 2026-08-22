'use client';

import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ProjectTag } from '@/components/ui/project-tag';
import { StatItem } from '@/components/ui/stat-item';
import { Surface } from '@/components/ui/surface';
import { calculateDuration } from '@/lib/task-rules';
import { DailyPanel } from '@/features/daily/daily-panel';
import type { Project, Task, TaskStatus } from '@/types/domain';

const today = '2026-08-23';
const projects: Project[] = [
  { id: 'work', name: '工作', color: '#4f8cff', status: 'active', createdAt: today },
  { id: 'course', name: '课程', color: '#8b7cf6', status: 'active', createdAt: today },
  {
    id: 'research',
    name: 'AI研究',
    color: '#38a774',
    status: 'active',
    createdAt: today,
  },
  { id: 'life', name: '生活', color: '#e9a04b', status: 'active', createdAt: today },
  { id: 'other', name: '其他', color: '#8793a7', status: 'active', createdAt: today },
];
const initialTasks: Task[] = [
  makeTask('email', 'work', '邮件处理', '08:30', undefined, 40),
  makeTask('stats', 'course', '统计课预习', '10:45', undefined, 60),
  makeTask('paper', 'course', '领域论文', '12:00', '13:30', 90, 56, true),
  makeTask('demo', 'research', '跑 Demo', '14:20', undefined, 45),
  makeTask('meeting', 'work', '会议记录', '15:10', '16:10', 60, 58, true),
  makeTask('gym', 'life', '健身', '17:00', undefined, 60),
  makeTask('adapter', 'other', '买转换插头'),
  makeTask('pickup', 'life', '取快递'),
];
function makeTask(
  id: string,
  projectId: string,
  title: string,
  plannedStartTime?: string,
  plannedEndTime?: string,
  plannedDurationMinutes?: number,
  actualDurationMinutes?: number,
  completed = false,
): Task {
  return {
    id,
    projectId,
    title,
    date: today,
    plannedStartTime,
    plannedEndTime,
    plannedDurationMinutes,
    actualDurationMinutes,
    completed,
    status: 'active',
    createdAt: today,
    updatedAt: today,
  };
}
function formatMinutes(value?: number) {
  if (value === undefined) return '—';
  return value < 60
    ? `${value}min`
    : `${Math.floor(value / 60)}h${value % 60 ? `${value % 60}min` : ''}`;
}
function normalizeTime(value: string) {
  const clean = value.trim();
  const parsed = /^\d{3,4}$/.test(clean)
    ? `${clean.slice(0, -2)}:${clean.slice(-2)}`
    : clean;
  if (!/^\d{1,2}:\d{2}$/.test(parsed)) return undefined;
  const [h, m] = parsed.split(':').map(Number);
  return h < 24 && m < 60
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    : undefined;
}

export function TaskDashboard() {
  const [tasks, setTasks] = useState(initialTasks);
  const [editing, setEditing] = useState<Task | undefined>();
  const dialog = useRef<HTMLDialogElement>(null);
  const shown = tasks.filter((t) => t.status === 'active' && t.date === today);
  const timed = shown
    .filter((t) => t.plannedStartTime)
    .sort((a, b) => a.plannedStartTime!.localeCompare(b.plannedStartTime!));
  const quick = shown.filter((t) => !t.plannedStartTime);
  const done = shown.filter((t) => t.completed).length;
  const actual = shown.reduce((sum, t) => sum + (t.actualDurationMinutes ?? 0), 0);
  const open = (task?: Task) => {
    setEditing(task);
    dialog.current?.showModal();
  };
  const update = (task: Task) =>
    setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));
  const save = (form: FormData) => {
    const title = String(form.get('title') ?? '').trim();
    const startRaw = String(form.get('start') ?? '');
    const endRaw = String(form.get('end') ?? '');
    const start = startRaw ? normalizeTime(startRaw) : undefined;
    const end = endRaw ? normalizeTime(endRaw) : undefined;
    if (
      !title ||
      (startRaw && !start) ||
      (endRaw && !end) ||
      (end && !start) ||
      (end && start && end < start)
    )
      return;
    const automatic = calculateDuration(start, end);
    const planned = automatic ?? numberOrUndefined(form.get('planned'));
    const base =
      editing ?? makeTask(crypto.randomUUID(), String(form.get('project')), title);
    update({
      ...base,
      title,
      projectId: String(form.get('project')),
      plannedStartTime: start,
      plannedEndTime: end,
      plannedDurationMinutes: planned,
      actualDurationMinutes: numberOrUndefined(form.get('actual')),
      updatedAt: new Date().toISOString(),
    });
    if (!editing)
      setTasks((current) => [
        ...current,
        {
          ...base,
          title,
          projectId: String(form.get('project')),
          plannedStartTime: start,
          plannedEndTime: end,
          plannedDurationMinutes: planned,
          actualDurationMinutes: numberOrUndefined(form.get('actual')),
          updatedAt: new Date().toISOString(),
        },
      ]);
    dialog.current?.close();
  };
  const move = (id: string, status: TaskStatus) =>
    setTasks((current) =>
      current.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              date: status === 'active' ? t.date : undefined,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    );
  return (
    <div className="dashboard">
      <Surface className="metric-strip">
        <StatItem
          label="普通任务"
          value={
            <>
              <em>{done}</em>
              <small>/ {shown.length}</small>
            </>
          }
        />
        <StatItem
          label="Daily"
          value={
            <>
              <em>2</em>
              <small>/ 3</small>
            </>
          }
        />
        <StatItem
          label="普通实际"
          value={
            <>
              <em>{formatMinutes(actual)}</em>
            </>
          }
        />
        <StatItem
          label="Daily 实际"
          value={
            <>
              <em>30min</em>
            </>
          }
        />
        <StatItem
          label="今日总实际"
          value={
            <>
              <em>{formatMinutes(actual + 30)}</em>
            </>
          }
        />
      </Surface>
      <Surface className="quick-panel">
        <header>
          <h2>无时间待办</h2>
          <button className="add-link" onClick={() => open()}>
            <Plus size={19} /> 添加
          </button>
        </header>
        <div className="quick-tasks">
          {quick.map((task) => (
            <TaskLine
              key={task.id}
              task={task}
              onUpdate={update}
              onEdit={() => open(task)}
              onMove={move}
            />
          ))}
        </div>
      </Surface>
      <div className="dashboard-columns">
        <Surface className="schedule-panel">
          <header>
            <h2>今日日程</h2>
            <button className="add-link" onClick={() => open()}>
              <Plus size={19} /> 添加
            </button>
          </header>
          <div className="timeline-head">
            <span>时间</span>
            <span>项目</span>
            <span>任务</span>
            <span>预计 / 实际</span>
          </div>
          {timed.map((task) => (
            <TaskLine
              key={task.id}
              task={task}
              onUpdate={update}
              onEdit={() => open(task)}
              onMove={move}
            />
          ))}
        </Surface>
        <DailyPanel />
      </div>
      <TaskDialog dialog={dialog} editing={editing} onSave={save} />
    </div>
  );
}
function numberOrUndefined(value: FormDataEntryValue | null) {
  return value === null || value === '' ? undefined : Number(value);
}
function TaskLine({
  task,
  onUpdate,
  onEdit,
  onMove,
}: {
  task: Task;
  onUpdate: (t: Task) => void;
  onEdit: () => void;
  onMove: (id: string, s: TaskStatus) => void;
}) {
  const project = projects.find((p) => p.id === task.projectId)!;
  const timed = Boolean(task.plannedStartTime);
  return (
    <div
      className={`${timed ? 'timeline-row' : 'quick-task-row'}${task.completed ? 'completed' : ''}`}
    >
      <time>
        {task.plannedStartTime}
        {task.plannedEndTime && `–${task.plannedEndTime}`}
      </time>
      <Checkbox
        aria-label={`完成${task.title}`}
        checked={task.completed}
        onChange={(e) =>
          onUpdate({
            ...task,
            completed: e.target.checked,
            completedAt: e.target.checked ? new Date().toISOString() : undefined,
          })
        }
      />
      <ProjectTag name={project.name} color={project.color} />
      <button className="task-title" onClick={onEdit}>
        {task.title}
      </button>
      {timed && (
        <span className="duration">
          <small>预计</small>
          {formatMinutes(task.plannedDurationMinutes)}
          <small>实际</small>
          {formatMinutes(task.actualDurationMinutes)}
        </span>
      )}
      <div className="task-actions">
        <button aria-label={`${task.title}更多操作`}>
          <MoreHorizontal size={17} />
        </button>
        <div>
          <button onClick={() => onMove(task.id, 'rescheduled')}>移期</button>
          <button onClick={() => onMove(task.id, 'backlog')}>待安排</button>
          <button onClick={() => onMove(task.id, 'abandoned')}>放弃</button>
          <button onClick={() => onMove(task.id, 'trashed')}>
            <Trash2 size={13} />
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
function TaskDialog({
  dialog,
  editing,
  onSave,
}: {
  dialog: React.RefObject<HTMLDialogElement | null>;
  editing?: Task;
  onSave: (data: FormData) => void;
}) {
  return (
    <dialog ref={dialog} className="task-dialog">
      <form action={onSave}>
        <header>
          <div>
            <p>{editing ? '编辑任务' : '快速新建'}</p>
            <h2>{editing ? '修改任务' : '添加任务'}</h2>
          </div>
          <button formMethod="dialog" aria-label="关闭">
            ×
          </button>
        </header>
        <label>
          任务名称
          <Input name="title" defaultValue={editing?.title} required />
        </label>
        <div className="task-form-grid">
          <label>
            项目
            <select name="project" defaultValue={editing?.projectId ?? 'other'}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            开始时间
            <Input
              name="start"
              defaultValue={editing?.plannedStartTime}
              placeholder="1420 或 14:20"
            />
          </label>
          <label>
            结束时间
            <Input
              name="end"
              defaultValue={editing?.plannedEndTime}
              placeholder="可选"
            />
          </label>
          <label>
            预计时长（分钟）
            <Input
              name="planned"
              type="number"
              defaultValue={editing?.plannedDurationMinutes}
            />
          </label>
          <label>
            实际时长（分钟）
            <Input
              name="actual"
              type="number"
              defaultValue={editing?.actualDurationMinutes}
            />
          </label>
        </div>
        <p>开始和结束同时填写时自动计算预计时长；不支持跨午夜。</p>
        <footer>
          <button formMethod="dialog">取消</button>
          <button type="submit">保存</button>
        </footer>
      </form>
    </dialog>
  );
}
