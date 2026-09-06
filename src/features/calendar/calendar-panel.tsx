/** @fileoverview 规划工作台：独立浏览日期、周/月选日及可持久化的普通任务安排。 */
'use client';

import { useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { useWorkspaceData } from '@/features/workspace/workspace-data-provider';
import { useTaskCreateAndEdit } from '@/features/tasks/hooks/use-task-create-and-edit';
import { TaskDialog, RescheduleDialog } from '@/features/tasks/components/task-dialogs';
import { addLocalDateDays, getLocalDateKey, parseLocalDateKey } from '@/lib/local-date';
import { getWeekRange, iterateLocalDateRange } from '@/lib/date-range';
import { groupPlanningTasks, planningDay } from './planning-rules';
import { PlanningMonth } from './planning-month';
import { PlanningTaskRow } from './planning-task-row';
import type { Task } from '@/types/domain';

/** 以明确日期显示计划，不读写首页的 selectedDate 或未来 Daily 实例。 */
export function CalendarPanel() {
  const {
    tasks,
    projects,
    createTask,
    createProject,
    saveTaskConfirmed,
    transitionTask,
  } = useWorkspaceData();
  const [date, setDate] = useState<string>(() => getLocalDateKey());
  const [monthOpen, setMonthOpen] = useState(false);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [editor, setEditor] = useState<{ task?: Task; date: string }>();
  const [rescheduling, setRescheduling] = useState<Task>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string>();
  const waitingRef = useRef<HTMLDetailsElement>(null);
  const today = getLocalDateKey();
  const days = useMemo(() => groupPlanningTasks(tasks), [tasks]);
  const day = planningDay(days.get(date) ?? []);
  const waiting = tasks.filter((task) => task.status === 'waiting' && !task.completed);
  const week = getWeekRange(date);
  const { saveTask } = useTaskCreateAndEdit({
    createTask,
    createProject,
    editing: editor?.task,
    projects,
    selectedDate: editor?.date ?? date,
    updateTask: saveTaskConfirmed,
  });

  /** 串行提交页面动作并保留失败；ref 阻止同一事件循环的重复请求。 */
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作失败，请重试。');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  /** 成功保存才关闭编辑，创建日期固定在打开表单时的日期。 */
  const save = async (form: FormData) => {
    if (!editor?.task && (editor?.date ?? date) < getLocalDateKey())
      return '请选择今天或未来日期';
    const message = await saveTask(form);
    if (!message) setEditor(undefined);
    return message;
  };
  /** 从空态进入同一待安排池，避免创建重复任务入口。 */
  const showWaiting = () => {
    setWaitingOpen(true);
    waitingRef.current?.scrollIntoView({ block: 'nearest' });
  };
  /** 所有行共用确定性动作，完成和编辑都等待服务器确认。 */
  const row = (task: Task) => (
    <PlanningTaskRow
      key={task.id}
      task={task}
      projects={projects}
      disabled={busy}
      targetDate={date}
      onEdit={() => setEditor({ task, date })}
      onComplete={() =>
        void run(() =>
          saveTaskConfirmed({
            ...task,
            completed: !task.completed,
            completedAt: task.completed ? undefined : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        )
      }
      onReschedule={() => setRescheduling(task)}
      onWaiting={() => void run(() => transitionTask(task.id, 'waiting'))}
      onSchedule={() => void run(() => transitionTask(task.id, 'scheduled', date))}
    />
  );

  return (
    <div className="planning-panel" data-testid="calendar-panel" aria-busy={busy}>
      <header className="planning-heading">
        <div>
          <h1>规划</h1>
          <p>给接下来要做的事，留好位置。</p>
        </div>
        <button
          className="planning-add"
          disabled={busy || date < today}
          onClick={() => setEditor({ date })}
        >
          <Plus size={18} aria-hidden="true" />
          添加任务
        </button>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="planning-layout">
        <aside className="planning-sidebar">
          <div className="planning-desktop-month">
            <PlanningMonth
              key={date.slice(0, 7)}
              date={date}
              days={days}
              onSelect={setDate}
            />
          </div>
          <details
            className="planning-waiting"
            ref={waitingRef}
            open={waitingOpen}
            onToggle={(event) => setWaitingOpen(event.currentTarget.open)}
          >
            <summary>
              待安排 <span>{waiting.length}</span>
            </summary>
            {waiting.length === 0 && <p>暂时没有待安排任务。</p>}
            {(['important', 'normal'] as const).map((importance) => {
              const items = waiting.filter((task) => task.importance === importance);
              return (
                items.length > 0 && (
                  <section key={importance}>
                    <h3>
                      {importance === 'important' ? '重要' : '普通'} · {items.length}
                    </h3>
                    {items.map(row)}
                  </section>
                )
              );
            })}
          </details>
        </aside>
        <section className="planning-agenda" aria-label="当天任务">
          <nav className="planning-week-nav" aria-label="规划日期导航">
            <button
              aria-label="上一周"
              onClick={() => setDate(addLocalDateDays(date, -7))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="planning-month-trigger"
              onClick={(event) => {
                event.currentTarget.focus();
                setMonthOpen(true);
              }}
              aria-haspopup="dialog"
            >
              <CalendarDays size={17} aria-hidden="true" />
              {date.slice(0, 4)} 年 {Number(date.slice(5, 7))} 月
            </button>
            <button
              aria-label="下一周"
              onClick={() => setDate(addLocalDateDays(date, 7))}
            >
              <ChevronRight size={18} />
            </button>
            <button onClick={() => setDate(getLocalDateKey())}>今天</button>
          </nav>
          <div
            className="planning-week"
            role="group"
            aria-label={`${week.start} 至 ${week.end}`}
          >
            {iterateLocalDateRange(week).map((item, index) => (
              <button
                key={item}
                aria-pressed={item === date}
                aria-current={item === today ? 'date' : undefined}
                aria-label={`${item}，${days.get(item)?.length ?? 0} 项任务`}
                onClick={() => setDate(item)}
              >
                <small>{['一', '二', '三', '四', '五', '六', '日'][index]}</small>
                <strong>{Number(item.slice(-2))}</strong>
                <small>{days.get(item)?.length ?? 0}</small>
              </button>
            ))}
          </div>
          <header className="planning-day-heading">
            <h3>
              {new Intl.DateTimeFormat('zh-CN', {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              }).format(parseLocalDateKey(date))}
            </h3>
            <p>
              {day.pending.length} 项待完成 ·{' '}
              {day.unestimated === day.pending.length && day.pending.length > 0
                ? '预计待补充'
                : `预计 ${day.estimated} 分钟`}
              {day.unestimated > 0 && ` · ${day.unestimated} 项未估时`}
            </p>
          </header>
          {(days.get(date)?.length ?? 0) === 0 && (
            <div className="planning-empty">
              <CalendarDays size={30} aria-hidden="true" />
              <h3>这一天还没有安排</h3>
              <p>
                {date < today
                  ? '可以切换日期查看其他安排。'
                  : '添加一件事，或把待安排任务放到这一天。'}
              </p>
              {date >= today && (
                <div>
                  <button disabled={busy} onClick={() => setEditor({ date })}>
                    添加任务
                  </button>
                  <button onClick={showWaiting}>从待安排中选择</button>
                </div>
              )}
            </div>
          )}
          {day.timed.length > 0 && (
            <section className="planning-group">
              <h4>有时间 · {day.timed.length}</h4>
              {day.timed.map(row)}
            </section>
          )}
          {day.untimed.length > 0 && (
            <section className="planning-group">
              <h4>未定时间 · {day.untimed.length}</h4>
              {day.untimed.map(row)}
            </section>
          )}
          {day.completed.length > 0 && (
            <details key={date} className="planning-completed">
              <summary>已完成 · {day.completed.length}</summary>
              {day.completed.map(row)}
            </details>
          )}
        </section>
      </div>
      {monthOpen && (
        <div className="planning-month-modal">
          <ManagementDialog
            title="选择日期"
            initialFocusSelector='button[aria-pressed="true"]'
            onClose={() => setMonthOpen(false)}
          >
            <PlanningMonth
              date={date}
              days={days}
              onSelect={(next) => {
                setDate(next);
                setMonthOpen(false);
              }}
            />
          </ManagementDialog>
        </div>
      )}
      {editor && (
        <TaskDialog
          key={editor.task?.id ?? editor.date}
          open
          editing={editor.task}
          mode={editor.task?.status === 'waiting' ? 'waiting' : 'normal'}
          projects={projects}
          onSave={save}
          onClose={() => setEditor(undefined)}
        />
      )}
      {rescheduling && (
        <RescheduleDialog
          key={rescheduling.id}
          task={rescheduling}
          defaultDate={date < today ? today : date}
          onClose={() => setRescheduling(undefined)}
          onSave={async (target) => {
            if (target < getLocalDateKey()) return '请选择今天或未来日期';
            if (target === rescheduling.date) return '请选择与原日期不同的日期';
            await transitionTask(rescheduling.id, 'rescheduled', target);
            setRescheduling(undefined);
            return undefined;
          }}
        />
      )}
    </div>
  );
}
