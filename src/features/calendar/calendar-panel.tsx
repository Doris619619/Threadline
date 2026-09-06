/** @fileoverview 规划工作台：独立浏览日期、周/月选日及可持久化的普通任务安排。 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { useWorkspaceData } from '@/features/workspace/workspace-data-provider';
import { useTaskCreateAndEdit } from '@/features/tasks/hooks/use-task-create-and-edit';
import { TaskDialog, RescheduleDialog } from '@/features/tasks/components/task-dialogs';
import { getLocalDateKey } from '@/lib/local-date';
import { groupPlanningTasks } from './planning-rules';
import { PlanningMonth } from './planning-month';
import { PlanningDay } from './planning-day';
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
  const [month, setMonth] = useState(() => getLocalDateKey().slice(0, 7));
  const [view, setView] = useState<'month' | 'day'>('month');
  const panelRef = useRef<HTMLDivElement>(null);
  const returnDate = useRef<string | undefined>(undefined);
  const returnToInbox = useRef(false);
  const previousView = useRef(view);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [editor, setEditor] = useState<{ task?: Task; date: string }>();
  const [rescheduling, setRescheduling] = useState<Task>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string>();
  const waitingRef = useRef<HTMLDetailsElement>(null);
  const today = getLocalDateKey();
  const days = useMemo(() => groupPlanningTasks(tasks), [tasks]);
  const waiting = tasks.filter((task) => task.status === 'waiting' && !task.completed);
  const { saveTask } = useTaskCreateAndEdit({
    createTask,
    createProject,
    editing: editor?.task,
    projects,
    selectedDate: editor?.date ?? date,
    updateTask: saveTaskConfirmed,
  });

  /** 页面切换后把焦点交给标题或原入口；周条切日不打断键盘操作。 */
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    if (view === 'day') {
      const target = returnToInbox.current ? '.planning-waiting > summary' : 'h1';
      panelRef.current?.querySelector<HTMLElement>(target)?.focus();
    } else {
      const selector = returnToInbox.current
        ? '.planning-inbox'
        : `[data-date="${returnDate.current}"]`;
      panelRef.current?.querySelector<HTMLElement>(selector)?.focus();
    }
  }, [view]);
  /** 点击日期进入独立日详情，记住来源月份内的格子供返回定位。 */
  const openDay = (next: string) => {
    returnDate.current = next;
    returnToInbox.current = false;
    setDate(next);
    setView('day');
  };

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
    waitingRef.current?.querySelector('summary')?.focus();
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
    <div
      ref={panelRef}
      className="planning-panel"
      data-view={view}
      data-testid="calendar-panel"
      aria-busy={busy}
    >
      <header className="planning-heading">
        <div className="planning-page-title">
          {view === 'day' && (
            <button
              className="planning-back"
              aria-label="返回月历"
              onClick={() => setView('month')}
            >
              <ChevronLeft size={20} aria-hidden="true" />
              月历
            </button>
          )}
          <h1 tabIndex={-1}>{view === 'month' ? '规划' : '当天安排'}</h1>
        </div>
        {view === 'day' && (
          <button
            className="planning-add"
            disabled={busy || date < today}
            onClick={() => setEditor({ date })}
          >
            <Plus size={18} aria-hidden="true" />
            添加任务
          </button>
        )}
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {view === 'month' ? (
        <PlanningMonth
          date={date}
          month={month}
          days={days}
          waitingCount={waiting.length}
          onMonth={setMonth}
          onSelect={openDay}
          onWaiting={() => {
            returnToInbox.current = true;
            setDate(today);
            setWaitingOpen(true);
            setView('day');
          }}
        />
      ) : (
        <div className="planning-detail">
          <PlanningDay
            date={date}
            days={days}
            busy={busy}
            row={row}
            onDate={setDate}
            onCreate={() => setEditor({ date })}
            onWaiting={showWaiting}
          />
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
