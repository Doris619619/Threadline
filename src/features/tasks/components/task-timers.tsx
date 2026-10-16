/** @fileoverview 共享三任务计时会话：首页和独立计时站共用账号状态、续时与异步完成记账。 */
'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceView } from '@/components/app-shell';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { useWorkspaceData } from '@/features/workspace/workspace-data-context';
import { useAccountToday } from '@/features/settings/account-timezone-provider';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { getAccountTimezone } from '@/lib/account-clock';
import {
  timerElapsed,
  pauseTimer,
  extendCountdown,
  normalizeTaskTimers,
  type TaskTimer,
} from '../timer-rules';
import { TaskTimerContext } from '../task-timer-context';
import { TaskTimerCard } from './task-timer-card';
import { TaskTimerDialog } from './task-timer-dialog';
import { TimerStation } from './timer-station';
import { useTimerStation } from '../hooks/use-timer-station';

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

/** 墙钟恢复后台耗时并按最新缓存应用续时；首页与计时站只创建展示实例，不复制 Provider。 */
function TaskTimersSession({
  owner,
  children,
}: {
  owner: string;
  children: ReactNode;
}) {
  const { active } = useWorkspaceView();
  const { isWorkstation } = useDesktopWindow();
  const {
    tasks,
    projects,
    recordTaskActual,
    hydrated: workspaceReady,
  } = useWorkspaceData();
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
  const station = useTimerStation(hydrated && workspaceReady);
  const saves = useRef(new Map<string, Promise<unknown>>());
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
          firstStartedAt: stamp,
          entryDate: today,
          intervals: [],
          timezone: getAccountTimezone(),
        },
      ];
    });
    if (error) return error;
    setNow(stamp);
  };
  /** 续时只接收分钟意图；在最新缓存上复核到时与保存状态，避免旧面板覆盖另一标签的操作。 */
  const extend = useCallback(
    (id: string, minutes: number) => {
      const stamp = Date.now();
      setTimers((current) =>
        current.map((timer) =>
          timer.id === id ? extendCountdown(timer, minutes, stamp) : timer,
        ),
      );
      setNow(stamp);
    },
    [setTimers],
  );
  /** 首页和子窗口复用同一组回调；CAS 拒绝旧卡片覆盖，进行中的保存共用 Promise，避免重复记账。 */
  function renderTimer(timer: TaskTimer, variant: 'default' | 'station' = 'default') {
    const task = tasks.find((item) => item.id === timer.taskId);
    return (
      <TaskTimerCard
        key={timer.id}
        timer={timer}
        task={task}
        now={now}
        today={today}
        variant={variant}
        projectName={projects.find((project) => project.id === task?.projectId)?.name}
        onChange={(next) => {
          let accepted = false;
          setTimers((current) =>
            current.map((item) => {
              if (
                item.id !== timer.id ||
                JSON.stringify(item) !== JSON.stringify(timer)
              )
                return item;
              accepted = true;
              return next;
            }),
          );
          return accepted;
        }}
        onExtend={(minutes) => extend(timer.id, minutes)}
        onRemove={() =>
          setTimers((current) => current.filter((item) => item.id !== timer.id))
        }
        onRecord={(original, minutes, date, recording) => {
          const existing = saves.current.get(timer.id);
          if (existing) return existing;
          const pending = recordTaskActual(
            original,
            minutes,
            date ?? timer.entryDate,
            true,
            recording,
          ).finally(() => saves.current.delete(timer.id));
          saves.current.set(timer.id, pending);
          return pending;
        }}
      />
    );
  }
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
              {timers.map((timer) => renderTimer(timer))}
            </div>
          </section>,
          host,
        )}
      {station.host &&
        createPortal(
          <TimerStation count={timers.length}>
            {timers.map((timer) => renderTimer(timer, 'station'))}
          </TimerStation>,
          station.host,
        )}
      {station.error && (
        <p role="alert" className="form-error">
          {station.error}
        </p>
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
