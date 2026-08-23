'use client';

import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { addDays, format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ProjectTag } from '@/components/ui/project-tag';
import { StatItem } from '@/components/ui/stat-item';
import { Surface } from '@/components/ui/surface';
import { calculateDuration } from '@/lib/task-rules';
import { taskFormSchema } from '@/lib/schemas';
import {
  DailyPanel,
  seedDaily,
  type Daily,
  type DailyHistoryEntry,
} from '@/features/daily/daily-panel';
import { ProjectPanel } from '@/features/projects/project-panel';
import { ReviewPanel } from '@/features/reviews/review-panel';
import { HistoryPanel } from '@/features/history/history-panel';
import { useWorkspaceView } from '@/components/app-shell';
import { usePersistentState } from '@/hooks/use-persistent-state';
import type {
  CloseRecord,
  HistoryEvent,
  Project,
  Task,
  TaskStatus,
} from '@/types/domain';

const today = '2026-08-23';
const projectSeed: Project[] = [
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
function isTrashExpired(task: Task) {
  return (
    task.status === 'trashed' &&
    Boolean(task.deletedAt) &&
    new Date(task.deletedAt!).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000
  );
}
const withoutExpiredTasks = (items: Task[]) =>
  items.filter((task) => !isTrashExpired(task));
function createDailyInstance(date: string, templates: Daily[]): Daily[] {
  if (date === today) return structuredClone(templates);
  return templates.map((item) => ({
    ...item,
    actual: 0,
    result: '',
    completed: false,
    children: item.children.map((child) => ({ ...child, actual: 0, completed: false })),
  }));
}

export function TaskDashboard() {
  const { active, selectedDate } = useWorkspaceView();
  const [tasks, setTasks] = usePersistentState(
    'threadline.tasks.v1',
    () => withoutExpiredTasks(initialTasks),
    withoutExpiredTasks,
  );
  const [workspaceProjects, setWorkspaceProjects] = usePersistentState(
    'threadline.projects.v1',
    projectSeed,
  );
  const [dailyByDate, setDailyByDate] = usePersistentState<Record<string, Daily[]>>(
    'threadline.daily-by-date.v1',
    { [today]: seedDaily },
  );
  const [dailyTemplates, setDailyTemplates] = usePersistentState<Daily[]>(
    'threadline.daily-templates.v1',
    seedDaily,
  );
  const [dailyHistory, setDailyHistory] = usePersistentState<DailyHistoryEntry[]>(
    'threadline.daily-history.v1',
    [],
  );
  const [history, setHistory] = usePersistentState<HistoryEvent[]>(
    'threadline.history.v1',
    [],
  );
  const [closeRecords, setCloseRecords] = usePersistentState<CloseRecord[]>(
    'threadline.close-records.v1',
    [],
  );
  const [editing, setEditing] = useState<Task | undefined>();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState<Task | undefined>();
  const closeDialog = useRef<HTMLDialogElement>(null);
  const shown = tasks.filter((t) => t.status === 'active' && t.date === selectedDate);
  const movedFromSelectedDate = tasks.filter(
    (task) =>
      task.status === 'active' &&
      task.date !== selectedDate &&
      task.postponedFrom === selectedDate,
  );
  const daily =
    dailyByDate[selectedDate] ?? createDailyInstance(selectedDate, dailyTemplates);
  const tomorrow = format(
    addDays(new Date(`${selectedDate}T00:00:00`), 1),
    'yyyy-MM-dd',
  );
  const timed = shown
    .filter((t) => t.plannedStartTime)
    .sort((a, b) => a.plannedStartTime!.localeCompare(b.plannedStartTime!));
  const quick = shown.filter((t) => !t.plannedStartTime);
  const backlog = tasks.filter((t) => t.status === 'backlog');
  const done = shown.filter((t) => t.completed).length;
  const normalTaskTotal = shown.length + movedFromSelectedDate.length;
  const actual = shown.reduce((sum, t) => sum + (t.actualDurationMinutes ?? 0), 0);
  const dailyActual = daily.reduce((sum, item) => sum + item.actual, 0);
  const dailyDone = daily.filter(
    (item) => item.completed || item.children.some((child) => child.completed),
  ).length;
  const open = (task?: Task) => {
    setEditing(task);
    setTaskDialogOpen(true);
  };
  const update = (task: Task) =>
    setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));
  const save = (form: FormData): string | undefined => {
    const title = String(form.get('title') ?? '').trim();
    const startRaw = String(form.get('start') ?? '');
    const endRaw = String(form.get('end') ?? '');
    const start = startRaw ? normalizeTime(startRaw) : undefined;
    const end = endRaw ? normalizeTime(endRaw) : undefined;
    const parsed = taskFormSchema.safeParse({
      title,
      projectId: String(form.get('project') ?? ''),
      plannedMinutes: numberOrUndefined(form.get('planned')),
      actualMinutes: numberOrUndefined(form.get('actual')),
    });
    if (!parsed.success) return parsed.error.issues[0]?.message ?? '请检查任务信息';
    if (startRaw && !start) return '开始时间格式应为 1420 或 14:20';
    if (endRaw && !end) return '结束时间格式应为 1530 或 15:30';
    if (end && !start) return '填写结束时间前，请先填写开始时间';
    if (end && start && end < start) return '暂不支持跨午夜任务，请选择同一天内的时间';
    const automatic = calculateDuration(start, end);
    const planned = automatic ?? numberOrUndefined(form.get('planned'));
    const base =
      editing ?? makeTask(crypto.randomUUID(), String(form.get('project')), title);
    update({
      ...base,
      title,
      projectId: String(form.get('project')),
      date: editing?.date ?? selectedDate,
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
          date: selectedDate,
          plannedStartTime: start,
          plannedEndTime: end,
          plannedDurationMinutes: planned,
          actualDurationMinutes: numberOrUndefined(form.get('actual')),
          updatedAt: new Date().toISOString(),
        },
      ]);
    setTaskDialogOpen(false);
    return undefined;
  };
  const appendHistory = (
    type: string,
    taskId?: string,
    payload: Record<string, string> = {},
  ) =>
    setHistory((current) => [
      {
        id: crypto.randomUUID(),
        taskId,
        type,
        occurredAt: new Date().toISOString(),
        payload,
      },
      ...current,
    ]);
  const move = (id: string, status: TaskStatus) => {
    const task = tasks.find((item) => item.id === id);
    setTasks((current) =>
      current.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              date: status === 'active' ? t.date : undefined,
              postponedFrom:
                status !== 'active' ? (t.date ?? t.postponedFrom) : t.postponedFrom,
              abandonedAt:
                status === 'abandoned' ? new Date().toISOString() : t.abandonedAt,
              deletedAt: status === 'trashed' ? new Date().toISOString() : t.deletedAt,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    );
    appendHistory(status, id, { fromDate: task?.date ?? selectedDate });
  };
  const reschedule = (targetDate: string) => {
    if (!rescheduling) return;
    const sourceDate = rescheduling.date ?? selectedDate;
    if (targetDate <= sourceDate) return '请选择晚于原计划日期的未来日期';
    setTasks((current) =>
      current.map((task) =>
        task.id === rescheduling.id
          ? {
              ...task,
              status: 'active',
              date: targetDate,
              completed: false,
              completedAt: undefined,
              postponedFrom: sourceDate,
              postponedTo: targetDate,
              updatedAt: new Date().toISOString(),
            }
          : task,
      ),
    );
    appendHistory('rescheduled', rescheduling.id, {
      fromDate: sourceDate,
      toDate: targetDate,
    });
    setRescheduling(undefined);
    return undefined;
  };
  if (active === 'projects')
    return (
      <ProjectPanel
        items={workspaceProjects}
        tasks={tasks}
        daily={daily}
        dailyHistory={dailyHistory}
        onChange={setWorkspaceProjects}
      />
    );
  if (active === 'stats' || active === 'review')
    return (
      <ReviewPanel
        tasks={tasks}
        projects={workspaceProjects}
        daily={daily}
        dailyHistory={dailyHistory}
        history={history}
        closeRecords={closeRecords}
        selectedDate={selectedDate}
      />
    );
  if (active === 'settings')
    return (
      <HistoryPanel
        tasks={tasks}
        history={history}
        closeRecords={closeRecords}
        dailyHistory={dailyHistory}
        onUpdate={update}
      />
    );
  return (
    <div className="dashboard">
      <Surface className="metric-strip">
        <StatItem
          label="普通任务"
          value={
            <>
              <em>{done}</em>
              <small>/ {normalTaskTotal}</small>
            </>
          }
        />
        <StatItem
          label="Daily"
          value={
            <>
              <em>{dailyDone}</em>
              <small>/ {daily.length}</small>
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
              <em>{formatMinutes(dailyActual)}</em>
            </>
          }
        />
        <StatItem
          label="今日总实际"
          value={
            <>
              <em>{formatMinutes(actual + dailyActual)}</em>
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
              onReschedule={() => setRescheduling(task)}
              projects={workspaceProjects}
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
              onReschedule={() => setRescheduling(task)}
              projects={workspaceProjects}
            />
          ))}
        </Surface>
        <DailyPanel
          items={daily}
          history={dailyHistory}
          date={selectedDate}
          projects={workspaceProjects}
          onChange={(items) =>
            setDailyByDate((current) => ({ ...current, [selectedDate]: items }))
          }
          onAdd={(item) => {
            setDailyTemplates((current) => [...current, item]);
            setDailyByDate((current) => ({
              ...current,
              [selectedDate]: [...daily, item],
            }));
          }}
          onRecord={(entry) => setDailyHistory((current) => [entry, ...current])}
        />
      </div>
      <PlanningQueue
        tasks={backlog}
        projects={workspaceProjects}
        onUpdate={update}
        onMove={move}
        onArrange={(id) => {
          setTasks((current) =>
            current.map((task) =>
              task.id === id
                ? {
                    ...task,
                    status: 'active',
                    date: selectedDate,
                    updatedAt: new Date().toISOString(),
                  }
                : task,
            ),
          );
          appendHistory('scheduled', id, { toDate: selectedDate });
        }}
      />
      <button className="finish-day" onClick={() => closeDialog.current?.showModal()}>
        结束今天
      </button>
      <TaskDialog
        open={taskDialogOpen}
        editing={editing}
        projects={workspaceProjects}
        onSave={save}
        onClose={() => setTaskDialogOpen(false)}
      />
      <RescheduleDialog
        task={rescheduling}
        defaultDate={tomorrow}
        onSave={reschedule}
        onClose={() => setRescheduling(undefined)}
      />
      <CloseDialog
        dialog={closeDialog}
        tasks={shown}
        actual={actual}
        dailyDone={dailyDone}
        dailyCount={daily.length}
        dailyActual={dailyActual}
        tomorrow={tomorrow}
        onCloseDay={(form) => {
          const events: HistoryEvent[] = [];
          setTasks((current) =>
            current.map((task) => {
              const action = form.get(`action-${task.id}`);
              if (!action || task.completed) return task;
              const target = String(form.get(`date-${task.id}`) ?? '');
              events.push({
                id: crypto.randomUUID(),
                taskId: task.id,
                type: `close_${action}`,
                occurredAt: new Date().toISOString(),
                payload: {
                  fromDate: selectedDate,
                  ...(action === 'tomorrow' ? { toDate: tomorrow } : {}),
                  ...(action === 'date' && target ? { toDate: target } : {}),
                },
              });
              if (action === 'tomorrow')
                return {
                  ...task,
                  date: tomorrow,
                  status: 'active',
                  postponedFrom: selectedDate,
                  postponedTo: tomorrow,
                };
              if (action === 'backlog')
                return { ...task, status: 'backlog', date: undefined };
              if (action === 'abandoned')
                return {
                  ...task,
                  status: 'abandoned',
                  abandonedAt: new Date().toISOString(),
                };
              return target
                ? {
                    ...task,
                    date: target,
                    status: 'active',
                    postponedFrom: selectedDate,
                    postponedTo: target,
                  }
                : task;
            }),
          );
          setHistory((current) => [...events, ...current]);
          setDailyHistory((current) => [
            ...daily
              .filter(
                (item) =>
                  !current.some(
                    (entry) => entry.dailyId === item.id && entry.date === selectedDate,
                  ),
              )
              .map((item) => ({
                dailyId: item.id,
                projectId: item.projectId,
                date: selectedDate,
                completed:
                  item.completed || item.children.some((child) => child.completed),
                actual: item.actual,
                result: item.result,
              })),
            ...current,
          ]);
          const projectMinutes = Object.fromEntries(
            workspaceProjects.map((project) => [
              project.id,
              shown
                .filter((task) => task.projectId === project.id)
                .reduce((total, task) => total + (task.actualDurationMinutes ?? 0), 0) +
                daily
                  .filter((item) => item.projectId === project.id)
                  .reduce((total, item) => total + item.actual, 0),
            ]),
          );
          setCloseRecords((current) => [
            ...current.filter((record) => record.date !== selectedDate),
            {
              id: crypto.randomUUID(),
              date: selectedDate,
              closedAt: new Date().toISOString(),
              projectMinutes,
            },
          ]);
          closeDialog.current?.close();
        }}
      />
    </div>
  );
}
function CloseDialog({
  dialog,
  tasks,
  actual,
  dailyDone,
  dailyCount,
  dailyActual,
  tomorrow,
  onCloseDay,
}: {
  dialog: React.RefObject<HTMLDialogElement | null>;
  tasks: Task[];
  actual: number;
  dailyDone: number;
  dailyCount: number;
  dailyActual: number;
  tomorrow: string;
  onCloseDay: (data: FormData) => void;
}) {
  const unfinished = tasks.filter((task) => !task.completed);
  return (
    <dialog className="task-dialog close-dialog" ref={dialog}>
      <form action={onCloseDay}>
        <header>
          <div>
            <p>每日收尾</p>
            <h2>结束今天</h2>
          </div>
          <button formMethod="dialog" aria-label="关闭">
            ×
          </button>
        </header>
        <div className="close-metrics">
          <span>
            普通任务{' '}
            <b>
              {tasks.filter((task) => task.completed).length}/{tasks.length}
            </b>
          </span>
          <span>
            Daily{' '}
            <b>
              {dailyDone}/{dailyCount}
            </b>
          </span>
          <span>
            普通实际 <b>{formatMinutes(actual)}</b>
          </span>
          <span>
            Daily 实际 <b>{formatMinutes(dailyActual)}</b>
          </span>
          <span>
            今日总实际 <b>{formatMinutes(actual + dailyActual)}</b>
          </span>
        </div>
        <h3>未完成普通任务</h3>
        {unfinished.length === 0 ? (
          <p>所有普通任务均已完成。</p>
        ) : (
          unfinished.map((task) => (
            <div className="close-task" key={task.id}>
              <b>{task.title}</b>
              <select name={`action-${task.id}`} defaultValue="tomorrow">
                <option value="tomorrow">移到明天</option>
                <option value="date">选择日期</option>
                <option value="backlog">待安排</option>
                <option value="abandoned">放弃</option>
              </select>
              <Input name={`date-${task.id}`} type="date" defaultValue={tomorrow} />
            </div>
          ))
        )}
        <p>未完成 Daily 只记录为今日未完成，不会顺延。</p>
        <footer>
          <button formMethod="dialog">稍后处理</button>
          <button type="submit">确认结束今天</button>
        </footer>
      </form>
    </dialog>
  );
}
function PlanningQueue({
  tasks,
  projects,
  onUpdate,
  onMove,
  onArrange,
}: {
  tasks: Task[];
  projects: Project[];
  onUpdate: (task: Task) => void;
  onMove: (id: string, status: TaskStatus) => void;
  onArrange: (id: string) => void;
}) {
  return (
    <Surface className="planning-queue">
      <header>
        <h2>待安排</h2>
        <span>重要 / 不重要 · DDL 可选</span>
      </header>
      {tasks.length === 0 ? (
        <p>还没有待安排事项。任务选择“待安排”后会出现在这里。</p>
      ) : (
        tasks.map((task) => {
          const project =
            projects.find((item) => item.id === task.projectId) ?? projectSeed[4];
          return (
            <div className="queue-row" key={task.id}>
              <ProjectTag name={project.name} color={project.color} />
              <b>{task.title}</b>
              <select
                aria-label={`${task.title}重要性`}
                value={task.backlogImportance ?? 'important'}
                onChange={(event) =>
                  onUpdate({
                    ...task,
                    backlogImportance: event.target.value as
                      'important' | 'not_important',
                  })
                }
              >
                <option value="important">重要</option>
                <option value="not_important">不重要</option>
              </select>
              <Input
                aria-label={`${task.title} DDL`}
                type="datetime-local"
                value={task.ddlAt ?? ''}
                onChange={(event) =>
                  onUpdate({ ...task, ddlAt: event.target.value || undefined })
                }
              />
              <button onClick={() => onArrange(task.id)}>安排到今天</button>
              <button onClick={() => onMove(task.id, 'abandoned')}>放弃</button>
              <button onClick={() => onMove(task.id, 'trashed')}>删除</button>
            </div>
          );
        })
      )}
    </Surface>
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
  onReschedule,
  projects,
}: {
  task: Task;
  onUpdate: (t: Task) => void;
  onEdit: () => void;
  onMove: (id: string, s: TaskStatus) => void;
  onReschedule: () => void;
  projects: Project[];
}) {
  const project = projects.find((p) => p.id === task.projectId) ?? projectSeed[4];
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
          <button onClick={onReschedule}>移期</button>
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
function RescheduleDialog({
  task,
  defaultDate,
  onSave,
  onClose,
}: {
  task?: Task;
  defaultDate: string;
  onSave: (date: string) => string | undefined;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  if (!task) return null;
  return (
    <div className="task-dialog-backdrop" role="presentation">
      <form
        className="task-dialog reschedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="移期任务"
        onSubmit={(event) => {
          event.preventDefault();
          const date = String(new FormData(event.currentTarget).get('date') ?? '');
          const message = onSave(date);
          setError(message);
        }}
      >
        <header>
          <div>
            <h2>移期</h2>
            <p>{task.title}</p>
          </div>
          <button type="button" aria-label="关闭移期" onClick={onClose}>
            ×
          </button>
        </header>
        <label>
          新日期
          <Input aria-label="移期日期" name="date" type="date" defaultValue={defaultDate} />
        </label>
        <p className="dialog-hint">默认明天；也可选择任意未来日期。原日期历史会保留。</p>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit">确认移期</button>
        </footer>
      </form>
    </div>
  );
}
function TaskDialog({
  open,
  editing,
  projects,
  onSave,
  onClose,
}: {
  open: boolean;
  editing?: Task;
  projects: Project[];
  onSave: (data: FormData) => string | undefined;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  if (!open) return null;
  return (
    <div className="task-dialog-backdrop" role="presentation">
      <section
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? '编辑任务' : '添加任务'}
      >
        <form
          action={(data) => {
            const message = onSave(data);
            setError(message);
          }}
        >
          <header>
            <div>
              <p>{editing ? '编辑任务' : '快速新建'}</p>
              <h2>{editing ? '修改任务' : '添加任务'}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="关闭">
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
                {projects
                  .filter(
                    (project) =>
                      project.status === 'active' || project.id === editing?.projectId,
                  )
                  .map((project) => (
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
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button type="submit">保存</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
