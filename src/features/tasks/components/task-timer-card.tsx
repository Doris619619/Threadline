/** @fileoverview 红色倒计时与绿色正计时卡片；直接暂停/继续和完成，删除放入上下文菜单。 */
'use client';
import {
  Check,
  Clock3,
  MoreHorizontal,
  Pause,
  Play,
  Timer,
  Trash2,
} from 'lucide-react';
import { useRef } from 'react';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import { useTaskMenu } from '../hooks/use-task-menu';
import { TaskActionsPopover } from './task-actions-popover';
import { pauseTimer, timerClock, timerElapsed, type TaskTimer } from '../timer-rules';
import type { Task } from '@/types/domain';
import type { SaveStageEstimate } from '@/features/stage-plans/task-estimate-editor';

/** 颜色和文字同时标明模式；删除只移除本机计时，完成则固定写入意图并原子记账。 */
export function TaskTimerCard({
  timer,
  task,
  now,
  today,
  onChange,
  onRemove,
  onRecord,
}: {
  timer: TaskTimer;
  task?: Task;
  now: number;
  today: string;
  onChange: (timer: TaskTimer) => void;
  onRemove: () => void;
  onRecord: SaveStageEstimate;
}) {
  const { busy, error, run } = useGuardedAction();
  const menu = useTaskMenu();
  const menuAnchor = useRef<HTMLElement>(null);
  const elapsed = timerElapsed(timer, now);
  const ended = timer.mode === 'down' && elapsed >= timer.targetMs;
  const running = timer.startedAt !== undefined && !ended;
  const title = task?.title ?? timer.title;
  /** 发送前冻结基准与分钟数；失败重试同一保存意图，避免未知网络结果重复记账。 */
  const finish = () =>
    void run(async () => {
      if (!task || task.deletedAt || !['active', 'waiting'].includes(task.status))
        throw new Error('任务已移除或放弃，请核对后移除计时。');
      menu.close();
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
    <article
      className="task-timer"
      aria-label={'计时 ' + title}
      data-running={running}
      data-mode={timer.mode}
      ref={menuAnchor}
      tabIndex={0}
      onContextMenu={menu.onContextMenu}
      onKeyDown={menu.onKeyDown}
    >
      <div className="task-timer-symbol" aria-hidden="true">
        {timer.mode === 'up' ? <Clock3 size={22} /> : <Timer size={22} />}
      </div>
      <div className="task-timer-body">
        <div className="task-timer-heading">
          <span className="task-timer-mode">
            {timer.mode === 'up' ? '正计时' : '倒计时'}
          </span>
          <strong title={title}>{title}</strong>
        </div>
        <time
          className="task-timer-readout"
          title={'已用 ' + timerClock(elapsed)}
          aria-label={
            (timer.mode === 'up' ? '正计时' : '倒计时') +
            (ended ? '已到时' : running ? '运行中' : '已暂停')
          }
        >
          {timerClock(timer.mode === 'up' ? elapsed : timer.targetMs - elapsed)}
        </time>
        {ended && <span className="task-timer-ended">已到时</span>}
      </div>
      <div className="task-timer-actions">
        <button
          type="button"
          className="task-timer-primary"
          aria-label={running ? '暂停' : '继续'}
          title={running ? '暂停' : '继续'}
          disabled={busy || ended || !!timer.pending}
          onClick={() =>
            onChange(
              running
                ? pauseTimer(timer, Date.now())
                : { ...timer, startedAt: Date.now() },
            )
          }
        >
          {running ? (
            <Pause size={18} aria-hidden="true" />
          ) : (
            <Play size={18} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={finish}
          aria-label={busy ? '保存中…' : timer.pending ? '重试保存' : '完成并记耗时'}
          title={'完成任务并记录 ' + Math.round(elapsed / 60000) + ' 分钟'}
        >
          {busy ? '…' : timer.pending ? '重试' : <Check size={18} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="task-timer-more"
          aria-label={title + '计时器更多操作'}
          aria-haspopup="menu"
          aria-expanded={menu.open}
          disabled={busy}
          onClick={menu.toggle}
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      </div>
      {menu.open && (
        <TaskActionsPopover
          anchor={menuAnchor}
          point={menu.point}
          label={title + '计时器操作'}
          className="waiting-task-menu task-timer-menu"
          role="menu"
          onClose={menu.close}
        >
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            disabled={busy}
            onClick={() => {
              menu.close();
              onRemove();
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            {timer.pending ? '核对后删除计时器' : '删除计时器'}
          </button>
        </TaskActionsPopover>
      )}
      {timer.entryDate !== today && (
        <small className="task-timer-date">记入 {timer.entryDate}</small>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </article>
  );
}
