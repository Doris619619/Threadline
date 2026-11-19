/** @fileoverview 计时站外壳保留完整窗口命令；极短窄窗将导航和排列收纳进可访问菜单，计时会话不变。 */
'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Minus, MoreHorizontal, Pin, X } from 'lucide-react';
import { getMainDesktopBridge, type TimerStationCommand } from '@/lib/desktop-bridge';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { useTimerStationFit } from '../hooks/use-timer-station-fit';
import { useTaskMenu } from '../hooks/use-task-menu';
import { TaskActionsPopover } from './task-actions-popover';

type Preferences = { layout: 'horizontal' | 'vertical'; pinned: boolean };
/** 持久化值只允许两种排列，损坏或旧配置回到横向置顶。 */
function normalize(value: Preferences): Preferences {
  return {
    layout: value?.layout === 'vertical' ? 'vertical' : 'horizontal',
    pinned: value?.pinned !== false,
  };
}

/** 共享父窗口桌面上下文以恢复完整工作台；仅配置变化时更新计时站，秒级刷新不抢焦点。 */
export function TimerStation({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [preferences, setPreferences, hydrated] = usePersistentState<Preferences>(
    'threadline.timer-station.v1',
    { layout: 'horizontal', pinned: true },
    normalize,
  );
  const [error, setError] = useState('');
  const [openingWorkspace, setOpeningWorkspace] = useState(false);
  const menu = useTaskMenu();
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const restoreLayoutFocus = useRef(false);
  const { setMode } = useDesktopWindow();
  const { layout, pinned } = preferences;
  const { viewportRef, canvasRef } = useTimerStationFit(count, layout);
  useEffect(() => {
    if (!hydrated) return;
    void getMainDesktopBridge()
      ?.timerStationControl?.({ action: 'configure', count, layout, pinned })
      .then(() => {
        if (!restoreLayoutFocus.current) return;
        restoreLayoutFocus.current = false;
        const trigger = menuAnchor.current;
        const view = trigger?.ownerDocument.defaultView;
        view?.requestAnimationFrame(() => {
          const target = trigger?.getClientRects().length
            ? trigger
            : trigger?.ownerDocument.querySelector<HTMLButtonElement>(
                '.timer-station-layout button[aria-pressed="true"]',
              );
          target?.focus({ preventScroll: true });
        });
      })
      .catch(() => setError('窗口设置失败，请关闭计时站后重试。'));
  }, [count, layout, pinned, hydrated]);
  /** 原生窗口命令失败时就地提示；不触碰计时会话。 */
  function control(command: TimerStationCommand) {
    void getMainDesktopBridge()
      ?.timerStationControl?.(command)
      .catch(() => setError('窗口操作失败，请重试。'));
  }
  /** 只返回完整工作台并聚焦原主窗口；原生层收起计时站，full 已选中时也须恢复隐藏窗口。 */
  async function openWorkspace() {
    if (openingWorkspace) return;
    setOpeningWorkspace(true);
    setError('');
    try {
      await setMode('full');
      await getMainDesktopBridge()?.bringToFront();
    } catch {
      setError('切换工作视图失败，请重试。');
    } finally {
      setOpeningWorkspace(false);
    }
  }
  /** 短窗菜单只改变现有排列偏好，选择后收起并由共用浮层归还焦点。 */
  function chooseLayout(next: Preferences['layout']) {
    restoreLayoutFocus.current = next !== layout;
    setPreferences({ ...preferences, layout: next });
    menu.close();
  }
  return (
    <main
      className="timer-station"
      data-layout={layout}
      aria-label="计时站"
      data-empty={count === 0}
    >
      <header className="timer-station-header">
        <h1>计时站</h1>
        <div className="timer-station-controls">
          <button
            type="button"
            className="timer-station-workspace-link"
            aria-label="打开完整工作台"
            title="打开完整工作台"
            disabled={openingWorkspace}
            onClick={() => void openWorkspace()}
          >
            打开完整工作台
          </button>
          <div className="timer-station-layout" role="group" aria-label="卡片排列">
            <button
              type="button"
              aria-pressed={layout === 'vertical'}
              onClick={() => setPreferences({ ...preferences, layout: 'vertical' })}
            >
              纵向
            </button>
            <button
              type="button"
              aria-pressed={layout === 'horizontal'}
              onClick={() => setPreferences({ ...preferences, layout: 'horizontal' })}
            >
              横向
            </button>
          </div>
          <div className="timer-station-window-controls">
            <button
              ref={menuAnchor}
              type="button"
              className="timer-station-compact-menu"
              aria-label="计时站更多操作"
              aria-haspopup="menu"
              aria-expanded={menu.open}
              onClick={menu.toggle}
              onKeyDown={menu.onKeyDown}
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="timer-station-pin"
              aria-label={pinned ? '取消置顶' : '置顶窗口'}
              title={pinned ? '取消置顶' : '置顶窗口'}
              aria-pressed={pinned}
              onClick={() => setPreferences({ ...preferences, pinned: !pinned })}
            >
              <Pin size={16} strokeWidth={1.6} />
            </button>
            <button
              type="button"
              aria-label="最小化计时站"
              title="最小化"
              onClick={() => control({ action: 'minimize' })}
            >
              <Minus size={16} strokeWidth={1.6} />
            </button>
            <button
              type="button"
              aria-label="关闭计时站"
              title="关闭计时站，保留计时"
              onClick={() => control({ action: 'close' })}
            >
              <X size={16} strokeWidth={1.6} />
            </button>
          </div>
        </div>
      </header>
      {menu.open && (
        <TaskActionsPopover
          anchor={menuAnchor}
          label="计时站操作"
          role="menu"
          onClose={menu.close}
        >
          <button
            type="button"
            role="menuitem"
            disabled={openingWorkspace}
            onClick={() => {
              menu.close();
              void openWorkspace();
            }}
          >
            打开完整工作台
          </button>
          <hr role="separator" />
          {(['vertical', 'horizontal'] as const).map((value) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={layout === value}
              key={value}
              onClick={() => chooseLayout(value)}
            >
              <Check
                size={16}
                aria-hidden="true"
                style={{ visibility: layout === value ? 'visible' : 'hidden' }}
              />
              {value === 'vertical' ? '纵向排列' : '横向排列'}
            </button>
          ))}
        </TaskActionsPopover>
      )}
      <section
        className="timer-station-viewport"
        aria-label="任务计时器"
        ref={viewportRef}
        tabIndex={0}
      >
        <div className="timer-station-cards task-timers" ref={canvasRef}>
          {count ? children : <p className="timer-station-empty">从任务菜单开始计时</p>}
        </div>
      </section>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </main>
  );
}
