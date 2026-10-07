/** @fileoverview 正/倒计时卡片；到时提供续时浮层，完成统一记账，删除放入上下文菜单。 */
'use client';
import { Check, MoreHorizontal, Pause, Play, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useGuardedAction } from '@/hooks/use-guarded-action';
import { useTaskMenu } from '../hooks/use-task-menu';
import { TaskActionsPopover } from './task-actions-popover';
import { TaskTimerExtension } from './task-timer-extension';
import { pauseTimer, timerClock, timerElapsed, type TaskTimer } from '../timer-rules';
import {
  accountClockParts,
  getAccountTimezone,
  timezoneLabel,
} from '@/lib/account-clock';
import { useAccountTimezone } from '@/features/settings/account-timezone-provider';
import type { Task } from '@/types/domain';
import type { SaveStageEstimate } from '@/features/stage-plans/task-estimate-editor';

/** 同排卡片展示首次开始时间；续时只提交分钟，由会话核验最新状态，完成时才记账。 */
export function TaskTimerCard({
  timer,
  task,
  now,
  today,
  onChange,
  onExtend,
  onRemove,
  onRecord,
}: {
  timer: TaskTimer;
  task?: Task;
  now: number;
  today: string;
  onChange: (timer: TaskTimer) => void;
  onExtend: (minutes: number) => void;
  onRemove: () => void;
  onRecord: SaveStageEstimate;
}) {
  const { busy, error, run } = useGuardedAction();
  const menu = useTaskMenu();
  const menuAnchor = useRef<HTMLElement>(null);
  const extensionAnchor = useRef<HTMLButtonElement>(null);
  const [extensionOpen, setExtensionOpen] = useState(false);
  useAccountTimezone();
  const zone = getAccountTimezone();
  const elapsed = timerElapsed(timer, now);
  const ended = timer.mode === 'down' && elapsed >= timer.targetMs;
  const running = timer.startedAt !== undefined && !ended;
  const canExtend = ended && !busy && !timer.pending;
  // 保存或外部续时使面板失效时清除打开意图，避免下次到时自动重开。
  if (extensionOpen && !canExtend) setExtensionOpen(false);
  const title = task?.title ?? timer.title;
  const started =
    timer.firstStartedAt === undefined
      ? undefined
      : accountClockParts(new Date(timer.firstStartedAt), zone);
  const startLabel = started
    ? `开始于 ${started.date.replaceAll('-', '/')} ${started.time.slice(0, 5)}`
    : '开始时间未记录';
  const startDescription = started
    ? `${startLabel}（${timezoneLabel(zone)}）`
    : '旧计时器没有保存首次开始时刻，暂停后不能推算准确开始时间';
  /** 主操作在到时后打开续时选项；待保存的计时不能继续或延长。 */
  const primaryAction = () => {
    if (busy || timer.pending) return;
    if (ended) {
      menu.close();
      setExtensionOpen(true);
    } else {
      onChange(
        running ? pauseTimer(timer, Date.now()) : { ...timer, startedAt: Date.now() },
      );
    }
  };
  /** 只发送续时分钟；会话在最新计时器上执行规则，防止覆盖跨标签保存意图。 */
  const extend = (minutes: number) => {
    if (!canExtend) return;
    onExtend(minutes);
    setExtensionOpen(false);
  };
  /** 取消、Escape 与原生轻关闭统一收起面板，焦点由浮层返回主按钮。 */
  const closeExtension = () => setExtensionOpen(false);
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
      title={(timer.mode === 'up' ? '正计时' : '倒计时') + ' · ' + title}
      data-running={running}
      data-mode={timer.mode}
      ref={menuAnchor}
      tabIndex={0}
      onContextMenu={menu.onContextMenu}
      onKeyDown={menu.onKeyDown}
    >
      <div className="task-timer-body">
        <div className="task-timer-heading">
          <strong title={title}>{title}</strong>
          {ended && <span className="task-timer-ended">已到时</span>}
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
      </div>
      <div className="task-timer-actions">
        <button
          type="button"
          ref={extensionAnchor}
          className={
            'task-timer-primary' + (ended ? ' task-timer-extension-trigger' : '')
          }
          aria-label={ended ? '延长' : running ? '暂停' : '继续'}
          aria-expanded={ended ? extensionOpen : undefined}
          title={ended ? '延长' : running ? '暂停' : '继续'}
          disabled={busy || !!timer.pending}
          onClick={primaryAction}
        >
          {ended ? (
            '延长'
          ) : running ? (
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
          title={
            '完成任务并记录 ' +
            Math.round(elapsed / 60000) +
            ' 分钟' +
            (timer.entryDate !== today ? ' · 记入 ' + timer.entryDate : '')
          }
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
      {extensionOpen && canExtend && (
        <TaskTimerExtension
          anchor={extensionAnchor}
          positionAnchor={menuAnchor}
          elapsedMs={elapsed}
          onExtend={extend}
          onClose={closeExtension}
        />
      )}
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
      <time
        className="task-timer-date"
        dateTime={
          timer.firstStartedAt === undefined
            ? undefined
            : new Date(timer.firstStartedAt).toISOString()
        }
        title={startDescription}
        aria-label={startDescription}
      >
        {startLabel}
      </time>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </article>
  );
}
