/** @fileoverview 共享三任务计时会话：任务菜单加入、账号隔离持久化、首页标题展示和异步完成记账。 */
'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceView } from '@/components/app-shell';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { useWorkspaceData } from '@/features/workspace/workspace-data-context';
import { useAccountToday } from '@/features/settings/account-timezone-provider';
import { usePersistentState } from '@/hooks/use-persistent-state';
import {
  timerElapsed,
  pauseTimer,
  normalizeTaskTimers,
  type TaskTimer,
} from '../timer-rules';
import { TaskTimerContext } from '../task-timer-context';
import { TaskTimerCard } from './task-timer-card';
import { TaskTimerDialog } from './task-timer-dialog';

/** 所有任务页面共享一个会话；换账号重置内存并恢复该账号的本机缓存。 */
export function TaskTimers({ children }: { children: ReactNode }) {
  const cloud = useOptionalCloudRuntime();
  return (
    <TaskTimersSession
      key={cloud?.user.id ?? 'local'}
      owner={cloud?.user.id ?? 'local'}
    >
      {children}
    </TaskTimersSession>
  );
}

/** 墙钟恢复刷新/后台耗时，倒计时到零暂停；菜单在任意页面可打开，卡片仅在首页展示。 */
function TaskTimersSession({
  owner,
  children,
}: {
  owner: string;
  children: ReactNode;
}) {
  const { active } = useWorkspaceView();
  const { isWorkstation } = useDesktopWindow();
  const { tasks, recordTaskActual, hydrated: workspaceReady } = useWorkspaceData();
  const today = useAccountToday();
  const [timers, setTimers, hydrated] = usePersistentState<TaskTimer[]>(
    'threadline.task-timers.v1:' + owner,
    [],
    normalizeTaskTimers,
    { synchronizeTabs: true },
  );
  const [now, setNow] = useState(() => Date.now());
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [taskId, setTaskId] = useState<string>();
  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      setHost(
        active === 'home' && !isWorkstation
          ? document.getElementById('home-timer-slot')
          : null,
      ),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [active, isWorkstation]);
  useEffect(() => {
    if (!timers.some((timer) => timer.startedAt !== undefined)) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timers]);
  useEffect(() => {
    if (
      !hydrated ||
      !timers.some(
        (timer) =>
          timer.startedAt !== undefined &&
          timer.mode === 'down' &&
          timerElapsed(timer, now) >= timer.targetMs,
      )
    )
      return;
    setTimers((current) =>
      current.map((timer) =>
        timer.startedAt !== undefined &&
        timer.mode === 'down' &&
        timerElapsed(timer, now) >= timer.targetMs
          ? pauseTimer(timer, now)
          : timer,
      ),
    );
  }, [now, timers, hydrated, setTimers]);
  /** 请求只打开设置；启动时再次核对任务，以应对设置期间的删除、完成或同步变化。 */
  const request = useCallback(
    (id: string) => {
      if (hydrated && workspaceReady) setTaskId(id);
    },
    [hydrated, workspaceReady],
  );
  const selected = tasks.find((task) => task.id === taskId);
  /** 在最新本机状态上核对重复和容量，避免另一标签删除后仍阻止重新计时。 */
  const start = (mode: 'up' | 'down', minutes: number) => {
    if (
      !selected ||
      selected.deletedAt ||
      selected.completed ||
      !['active', 'waiting'].includes(selected.status)
    )
      return '任务已完成或移除，请选择其他任务。';
    const stamp = Date.now();
    let error: string | undefined;
    setTimers((current) => {
      if (current.some((timer) => timer.taskId === selected.id)) {
        error = '这个任务已加入计时。';
        return current;
      }
      if (current.length >= 3) {
        error = '最多同时保留三个计时器。';
        return current;
      }
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          taskId: selected.id,
          title: selected.title,
          mode,
          targetMs: minutes * 60000,
          elapsedMs: 0,
          startedAt: stamp,
          entryDate: today,
        },
      ];
    });
    if (error) return error;
    setNow(stamp);
  };
  return (
    <TaskTimerContext.Provider
      value={{
        ready: hydrated && workspaceReady,
        taskIds: timers.map((timer) => timer.taskId),
        request,
      }}
    >
      {children}
      {host &&
        hydrated &&
        workspaceReady &&
        timers.length > 0 &&
        createPortal(
          <section className="task-timers" aria-label="任务计时器">
            <div className="task-timer-strip">
              {timers.map((timer) => (
                <TaskTimerCard
                  key={timer.id}
                  timer={timer}
                  task={tasks.find((task) => task.id === timer.taskId)}
                  now={now}
                  today={today}
                  onChange={(next) =>
                    setTimers((current) =>
                      current.map((item) => (item.id === timer.id ? next : item)),
                    )
                  }
                  onRemove={() =>
                    setTimers((current) =>
                      current.filter((item) => item.id !== timer.id),
                    )
                  }
                  onRecord={(original, minutes, date) =>
                    recordTaskActual(original, minutes, date ?? timer.entryDate, true)
                  }
                />
              ))}
            </div>
          </section>,
          host,
        )}
      {taskId && selected && (
        <TaskTimerDialog
          key={taskId}
          task={selected}
          onClose={() => setTaskId(undefined)}
          onStart={start}
        />
      )}
    </TaskTimerContext.Provider>
  );
}
