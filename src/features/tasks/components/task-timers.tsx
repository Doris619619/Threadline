/** @fileoverview 首页标题旁的三任务计时器：独立正/倒计时、暂停恢复与显式记录实际耗时。 */
'use client';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceView } from '@/components/app-shell';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { useWorkspaceData } from '@/features/workspace/workspace-data-context';
import { useAccountToday } from '@/features/settings/account-timezone-provider';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import {
  timerClock,
  timerElapsed,
  pauseTimer,
  normalizeTaskTimers,
  type TaskTimer,
} from '../timer-rules';
import type { Task } from '@/types/domain';
import type { SaveStageEstimate } from '@/features/stage-plans/task-estimate-editor';

/** 独立保存锁；发送前持久化固定意图，重试复用相同原值，避免未知网络结果重复加时。 */
function TimerCard({
  timer,
  task,
  now,
  onChange,
  onRemove,
  onRecord,
}: {
  timer: TaskTimer;
  task?: Task;
  now: number;
  onChange: (timer: TaskTimer) => void;
  onRemove: () => void;
  onRecord: SaveStageEstimate;
}) {
  const { busy, error, run } = useGuardedAction();
  const elapsed = timerElapsed(timer, now);
  const ended = timer.mode === 'down' && elapsed >= timer.targetMs;
  const running = timer.startedAt !== undefined && !ended;
  const rounded = Math.round(elapsed / 60000);
  /** 冻结计时和写入基准，保存失败保持这次分钟数；实际与任务完成使用同一次确认。 */
  const finish = () =>
    void run(async () => {
      if (!task || task.deletedAt || !['active', 'waiting'].includes(task.status))
        throw new Error('任务已移除或放弃，请核对后移除计时。');
      const paused = pauseTimer(timer, Date.now());
      const pending = timer.pending ?? {
        original: task,
        minutes:
          (task.actualDurationMinutes ?? 0) + Math.round(paused.elapsedMs / 60000),
      };
      onChange({ ...paused, pending });
      await onRecord(pending.original, pending.minutes, timer.entryDate);
      onRemove();
    });
  return (
    <article className="task-timer" aria-label={'计时 ' + (task?.title ?? timer.title)}>
      <strong title={task?.title ?? timer.title}>{task?.title ?? timer.title}</strong>
      <div className="task-timer-clock">
        <span>
          {timer.mode === 'up' ? '正计时' : ended ? '倒计时已到时' : '倒计时'}
        </span>
        <time>
          {timerClock(timer.mode === 'up' ? elapsed : timer.targetMs - elapsed)}
        </time>
      </div>
      <small>
        已用 {timerClock(elapsed)} · 记入 {timer.entryDate}
      </small>
      <div className="task-timer-actions">
        <button
          type="button"
          disabled={busy || ended || !!timer.pending}
          onClick={() =>
            onChange(
              running
                ? pauseTimer(timer, Date.now())
                : { ...timer, startedAt: Date.now() },
            )
          }
        >
          {running ? '暂停' : '继续'}
        </button>
        <button type="button" disabled={busy} onClick={finish}>
          {busy ? '保存中…' : timer.pending ? '重试保存' : '完成并记耗时'}
        </button>
        <button type="button" disabled={busy} onClick={onRemove}>
          {timer.pending ? '核对后移除' : '移除'}
        </button>
      </div>
      <small>本次 {rounded} 分钟，按分钟四舍五入 · 结束时完成任务</small>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </article>
  );
}

/** 三个计时器按账号隔离，仅本机持久化；切换页面仍运行，首页标题容器通过 Portal 展示。 */
export function TaskTimers() {
  const cloud = useOptionalCloudRuntime();
  return (
    <TaskTimersSession
      key={cloud?.user.id ?? 'local'}
      owner={cloud?.user.id ?? 'local'}
    />
  );
}
/** 用墙钟刷新显示，后台/刷新不丢时；倒计时到时暂停，不自动写账或申请系统通知。 */
function TaskTimersSession({ owner }: { owner: string }) {
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
  );
  const [now, setNow] = useState(() => Date.now());
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [adding, setAdding] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [mode, setMode] = useState<'up' | 'down'>('up');
  const [duration, setDuration] = useState('25');
  const [error, setError] = useState('');
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
  const available = tasks.filter(
    (task) =>
      !task.deletedAt &&
      !task.completed &&
      ['active', 'waiting'].includes(task.status) &&
      !timers.some((timer) => timer.taskId === task.id),
  );
  /** 最多三个且同任务不重复；选择任务不会将待安排项移入今日。 */
  const start = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const task = available.find((task) => task.id === taskId);
      const minutes = Number(duration);
      if (!task) {
        setError('请选择一个未完成任务。');
        return;
      }
      if (
        mode === 'down' &&
        (!/^\d+$/.test(duration) || minutes < 1 || minutes > 1440)
      ) {
        setError('倒计时请输入 1—1440 的整数分钟。');
        return;
      }
      const stamp = Date.now();
      setTimers((current) =>
        current.length >= 3 || current.some((timer) => timer.taskId === task.id)
          ? current
          : [
              ...current,
              {
                id: crypto.randomUUID(),
                taskId: task.id,
                title: task.title,
                mode,
                targetMs: (mode === 'down' ? minutes : 25) * 60000,
                elapsedMs: 0,
                startedAt: stamp,
                entryDate: today,
              },
            ],
      );
      setNow(stamp);
      setAdding(false);
      setTaskId('');
      setError('');
    },
    [available, duration, mode, setTimers, taskId, today],
  );
  if (!host || !hydrated || !workspaceReady) return null;
  return createPortal(
    <section className="task-timers" aria-label="任务计时器">
      <div className="task-timer-strip">
        {timers.map((timer) => (
          <TimerCard
            key={timer.id}
            timer={timer}
            task={tasks.find((task) => task.id === timer.taskId)}
            now={now}
            onChange={(next) =>
              setTimers((current) =>
                current.map((item) => (item.id === timer.id ? next : item)),
              )
            }
            onRemove={() =>
              setTimers((current) => current.filter((item) => item.id !== timer.id))
            }
            onRecord={(original, minutes, date) =>
              recordTaskActual(original, minutes, date ?? timer.entryDate, true)
            }
          />
        ))}
      </div>
      {timers.length < 3 && (
        <button
          type="button"
          className="home-layout-toggle"
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          {adding ? '取消添加计时器' : '+ 任务计时器'}
        </button>
      )}
      {adding && timers.length < 3 && (
        <form className="task-timer-form" onSubmit={start}>
          <label>
            计时任务
            <select
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              required
            >
              <option value="">选择任务</option>
              {projects.map((project) => (
                <optgroup key={project.id} label={project.name}>
                  {available
                    .filter((task) => task.projectId === project.id)
                    .map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            计时方式
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as 'up' | 'down')}
            >
              <option value="up">正计时</option>
              <option value="down">倒计时</option>
            </select>
          </label>
          {mode === 'down' && (
            <label>
              倒计时分钟
              <input
                inputMode="numeric"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </label>
          )}
          <button type="submit">开始计时</button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>,
    host,
  );
}
