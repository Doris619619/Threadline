/**
 * @fileoverview 应用外壳，提供工作台导航、日期上下文、窗口模式入口与悬浮图标交互。
 */

'use client';

/* eslint-disable @next/next/no-img-element -- 悬浮图标必须原样使用 Tauri 打包的本地位图。 */

import {
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  FolderKanban,
  Home,
  Settings,
  Sparkles,
} from 'lucide-react';
import { createContext, useContext, useRef, useState } from 'react';
import { addDays, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { DesktopWindowModeMenu } from '@/components/desktop-window-controls';
import { SidebarItem } from '@/components/ui/sidebar-item';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { startTauriDragging } from '@/lib/tauri-window';

const navigation = [
  { id: 'home', label: '首页', icon: Home, description: '安排、执行、记录今天' },
  { id: 'schedule', label: '日程', icon: CalendarDays, description: '按时间查看今天的任务' },
  { id: 'projects', label: '项目', icon: FolderKanban, description: '管理长期事项与任务归属' },
  { id: 'stats', label: '统计', icon: ChartNoAxesCombined, description: '了解投入时间与完成趋势' },
  { id: 'review', label: '复盘', icon: ClipboardList, description: '回顾完成、遗留与下一步' },
  { id: 'settings', label: '设置', icon: Settings, description: '桌面窗口、历史与回收站' },
] as const;

export type WorkspaceViewId = (typeof navigation)[number]['id'];
type WorkspaceView = { active: WorkspaceViewId; selectedDate: string };

const WorkspaceViewContext = createContext<WorkspaceView>({
  active: 'home',
  selectedDate: '2026-08-23',
});

/** 读取当前导航页与工作日期。 */
export const useWorkspaceView = () => useContext(WorkspaceViewContext);

/**
 * 渲染可点击恢复、可拖动移动且支持右键尺寸菜单的无边框悬浮图标。
 */
function FloatingLauncher() {
  const {
    floatingContextOpen,
    restoreFromFloating,
    setFloatingContextOpen,
    setMode,
    setFloatingSize,
  } = useDesktopWindow();
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    draggedRef.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current;
    if (!start || draggedRef.current) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return;
    draggedRef.current = true;
    void startTauriDragging();
  };

  const handleClick = () => {
    if (draggedRef.current) return;
    void restoreFromFloating();
  };

  return (
    <div className={`tl-floating-launcher${floatingContextOpen ? ' is-context-open' : ''}`}>
      <button
        type="button"
        className="tl-window mode-floating-icon"
        aria-label="展开 Threadline 工作台"
        title="单击展开，拖动移动，右键调整图标大小"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => {
          pointerStartRef.current = null;
        }}
        onClick={handleClick}
        onContextMenu={(event) => {
          event.preventDefault();
          void setFloatingContextOpen(!floatingContextOpen);
        }}
      >
        <img src="/desktop/threadline-app-icon.png" alt="Threadline" draggable={false} />
      </button>
      {floatingContextOpen && (
        <div className="tl-floating-context" role="menu" aria-label="悬浮图标菜单">
          <button type="button" role="menuitem" onClick={() => void setMode('full')}>
            打开完整工作台
          </button>
          <button type="button" role="menuitem" onClick={() => void setMode('mini-today')}>
            打开迷你今日
          </button>
          <p>图标大小</p>
          {[56, 72, 88].map((size) => (
            <button key={size} type="button" role="menuitem" onClick={() => void setFloatingSize(size)}>
              {size}px
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 渲染完整工作台、迷你今日和悬浮入口共用的应用壳层。 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<WorkspaceViewId>('home');
  const [selectedDate, setSelectedDate] = useState('2026-08-23');
  const { isFloatingIcon, isMiniToday } = useDesktopWindow();
  const activeItem = navigation.find((item) => item.id === active) ?? navigation[0];
  const shiftDate = (amount: number) =>
    setSelectedDate((current) =>
      format(addDays(new Date(`${current}T00:00:00`), amount), 'yyyy-MM-dd'),
    );
  const weekday = format(new Date(`${selectedDate}T00:00:00`), 'EE', { locale: zhCN });

  if (isFloatingIcon) return <FloatingLauncher />;

  return (
    <div className={`tl-window mode-${isMiniToday ? 'mini-today' : 'full'}`}>
      {!isMiniToday && (
        <aside className="tl-sidebar">
          <a className="tl-brand" href="#main-content">
            我的工作台
          </a>
          <nav aria-label="主导航">
            {navigation.map(({ id, label, icon: Icon }) => (
              <SidebarItem key={id} active={active === id} onClick={() => setActive(id)}>
                <Icon aria-hidden="true" size={18} />
                {label}
              </SidebarItem>
            ))}
          </nav>
          <div className="tl-profile">
            <div className="tl-avatar" aria-hidden="true">
              柠
            </div>
            <span>
              <b>柠檬同学</b>
              <small>专注 · 高效 · 成长</small>
            </span>
            <Sparkles aria-hidden="true" size={16} />
          </div>
        </aside>
      )}
      <main id="main-content" className="tl-main">
        <header className={`tl-header${isMiniToday ? ' is-mini' : ''}`}>
          <div>
            <h1>{isMiniToday ? '今日任务' : activeItem.label === '首页' ? '我的工作台' : activeItem.label}</h1>
            {!isMiniToday && <p>{activeItem.description}</p>}
          </div>
          <div className="tl-header-actions">
            <div className="tl-date">
              <button aria-label="前一天" onClick={() => shiftDate(-1)}>
                ‹
              </button>
              <time dateTime={selectedDate}>
                {selectedDate}　{weekday}
              </time>
              <button aria-label="后一天" onClick={() => shiftDate(1)}>
                ›
              </button>
              {!isMiniToday && (
                <button
                  aria-label="选择日期"
                  onClick={() =>
                    (document.getElementById('workspace-date-picker') as HTMLInputElement | null)?.showPicker()
                  }
                >
                  <CalendarDays size={20} />
                </button>
              )}
              <input
                id="workspace-date-picker"
                aria-label="工作区日期"
                className="sr-only"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </div>
            <DesktopWindowModeMenu />
          </div>
        </header>
        <WorkspaceViewContext.Provider value={{ active, selectedDate }}>
          {children}
        </WorkspaceViewContext.Provider>
      </main>
    </div>
  );
}
