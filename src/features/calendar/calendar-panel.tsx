/** @fileoverview 规划工作台：独立浏览日期、周/月选日及可持久化的普通任务安排。 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ManagementDialog } from '@/components/ui/management-dialog';
import { useWorkspaceData } from '@/features/workspace/workspace-data-provider';
import { useTaskCreateAndEdit } from '@/features/tasks/hooks/use-task-create-and-edit';
import { TaskDialog, RescheduleDialog } from '@/features/tasks/components/task-dialogs';
import { useAccountToday } from '@/features/settings/account-timezone-provider';
import { getLocalDateKey } from '@/lib/local-date';
import { groupPlanningTasks } from './planning-rules';
import { PlanningMonth } from './planning-month';
import { PlanningDay } from './planning-day';
import { PlanningTaskRow } from './planning-task-row';
import { PlanningWaitingPool } from './planning-waiting-pool';
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
  const today = useAccountToday();
  const [chosenDate, chooseDate] = useState<string | null>(null);
  const date = chosenDate ?? today;
  /** 默认日期随账号午夜更新，手选日期保持稳定。 */
  const setDate = (value: string) => chooseDate(value === today ? null : value);
  const [chosenMonth, chooseMonth] = useState<string | null>(null);
  const month = chosenMonth ?? today.slice(0, 7);
  const setMonth = (value: string) =>
    chooseMonth(value === today.slice(0, 7) ? null : value);
  const [view, setView] = useState<'month' | 'day'>('month');
  const panelRef = useRef<HTMLDivElement>(null);
  const returnDate = useRef<string | undefined>(undefined);
  const previousView = useRef(view);
  const [waitingOpen, setWaitingOpen] = useState<boolean>();
  const [notice, setNotice] = useState<string>();
  const [editor, setEditor] = useState<{
    task?: Task;
    date: string;
    focus?: 'start';
  }>();
  const [rescheduling, setRescheduling] = useState<Task>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionTrigger = useRef<HTMLElement | null>(null);
  const timeFocusTask = useRef<string | undefined>(undefined);
  const selectedTasks = tasks.filter((task) => selectedIds.includes(task.id));
  const waitingRef = useRef<HTMLDetailsElement>(null);
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
      const target = 'h1';
      panelRef.current?.querySelector<HTMLElement>(target)?.focus();
    } else {
      const selector = `[data-date="${returnDate.current}"]`;
      panelRef.current?.querySelector<HTMLElement>(selector)?.focus();
    }
  }, [view]);
  /** 补时间后原入口可能移出时间待定区，等 DOM 更新后把焦点交给时间块或仍存在的入口。 */
  useEffect(() => {
    if (editor || !timeFocusTask.current) return;
    const taskId = timeFocusTask.current;
    timeFocusTask.current = undefined;
    const target = panelRef.current?.querySelector<HTMLElement>(
      `.planning-time-event[data-task-id="${CSS.escape(taskId)}"], .planning-undated-task[data-task-id="${CSS.escape(taskId)}"] button`,
    );
    (target ?? panelRef.current?.querySelector<HTMLElement>('h1'))?.focus();
  }, [editor]);
  /** 点击日期进入独立日详情，记住来源月份内的格子供返回定位。 */
  const openDay = (next: string) => {
    returnDate.current = next;
    setDate(next);
    setNotice(undefined);
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
    if (!message) {
      if (editor?.focus === 'start') timeFocusTask.current = editor.task?.id;
      setEditor(undefined);
    }
    return message;
  };
  /** 记住实际点击的时间块；密集组展开后的每一项仍绑定原任务。 */
  const showSelection = (items: Task[]) => {
    selectionTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedIds(items.map((task) => task.id));
  };
  /** 完成或流转可移除原块、改变重叠组结构；入口消失时返回仍可聚焦的页标题。 */
  const closeSelection = () => {
    setSelectedIds([]);
    if (!selectionTrigger.current?.isConnected) {
      panelRef.current?.querySelector<HTMLElement>('h1')?.focus();
    }
  };
  /** 确认写入后显示真实安排结果；保留任务池以继续分配，移除入口后恢复可用焦点。 */
  const schedule = async (task: Task) => {
    const target = date;
    if (await run(() => transitionTask(task.id, 'scheduled', target))) {
      setNotice('已将“' + task.title + '”安排到 ' + target);
      if (selectedIds.length > 0) {
        closeSelection();
      } else {
        waitingRef.current
          ?.querySelector<HTMLInputElement>('input')
          ?.focus({ preventScroll: true });
      }
    }
  };
  /** 所有行共用确定性动作，完成和编辑都等待服务器确认。 */
  const row = (task: Task) => (
    <PlanningTaskRow
      key={task.id}
      task={task}
      projects={projects}
      disabled={busy}
      targetDate={date}
      onEdit={() => {
        setSelectedIds([]);
        setEditor({ task, date });
      }}
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
      onReschedule={() => {
        setSelectedIds([]);
        setRescheduling(task);
      }}
      onWaiting={() => void run(() => transitionTask(task.id, 'waiting'))}
      onSchedule={() => void schedule(task)}
    />
  );

  return (
    <div
      ref={panelRef}
      className="planning-panel"
      data-view={view}
      data-waiting-open={waitingOpen ?? false}
      data-testid="calendar-panel"
      aria-busy={busy}
    >
      {view === 'month' && (
        <header className="planning-heading">
          <h1 tabIndex={-1}>规划</h1>
        </header>
      )}
      {error && selectedTasks.length === 0 && !waitingOpen && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="planning-workspace">
        {view === 'month' ? (
          <PlanningMonth
            date={date}
            month={month}
            days={days}
            onMonth={setMonth}
            onSelect={openDay}
          />
        ) : (
          <div className="planning-detail">
            <PlanningDay
              date={date}
              days={days}
              busy={busy}
              row={row}
              projects={projects}
              onSelect={showSelection}
              onBack={() => setView('month')}
              onAdd={() => setEditor({ date })}
              onDate={(next) => {
                setDate(next);
                setNotice(undefined);
              }}
              onSetTime={(task) => setEditor({ task, date, focus: 'start' })}
            />
          </div>
        )}
        <PlanningWaitingPool
          date={date}
          tasks={waiting}
          busy={busy}
          open={waitingOpen}
          notice={notice}
          error={selectedTasks.length === 0 ? error : undefined}
          detailsRef={waitingRef}
          onOpen={setWaitingOpen}
          onDate={(next) => {
            // 日详情内选日保留原月历入口；月历中跨月选日则同步返回月份。
            if (view === 'month') {
              setMonth(next.slice(0, 7));
              openDay(next);
            } else {
              setDate(next);
              setNotice(undefined);
            }
          }}
          row={row}
        />
      </div>
      {selectedTasks.length > 0 && (
        <ManagementDialog
          title={selectedTasks.length === 1 ? '安排详情' : '重叠安排'}
          onClose={closeSelection}
        >
          <div className="planning-panel planning-event-detail" aria-busy={busy}>
            {selectedTasks.map(row)}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </ManagementDialog>
      )}
      {editor && (
        <TaskDialog
          key={editor.task?.id ?? editor.date}
          open
          editing={editor.task}
          initialFocus={editor.focus}
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
