/** @fileoverview 计时站窗口外壳：文字入口返回完整工作台、横纵排列、置顶和窗口控制，共用唯一计时会话。 */
'use client';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Minus, Pin, X } from 'lucide-react';
import { getMainDesktopBridge, type TimerStationCommand } from '@/lib/desktop-bridge';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { useDesktopWindow } from '@/lib/desktop-window-context';

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
  const { setMode } = useDesktopWindow();
  const { layout, pinned } = preferences;
  useEffect(() => {
    if (!hydrated) return;
    void getMainDesktopBridge()
      ?.timerStationControl?.({ action: 'configure', count, layout, pinned })
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
  return (
    <main
      className="timer-station"
      data-layout={layout}
      aria-label="计时站"
      style={{ '--station-count': Math.max(1, count) } as CSSProperties}
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
      </header>
      <section className="timer-station-cards task-timers" aria-label="任务计时器">
        {count ? children : <p className="timer-station-empty">从任务菜单开始计时</p>}
      </section>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </main>
  );
}
