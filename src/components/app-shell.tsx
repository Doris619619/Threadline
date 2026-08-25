/**
 * @fileoverview 应用外壳组件，包含侧边栏导航、个人资料和全局日期切换头部。
 */

'use client';

import {
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  FolderKanban,
  Home,
  Settings,
  Sparkles,
} from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { addDays, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { DesktopWindowControls } from '@/components/desktop-window-controls';
import { SidebarItem } from '@/components/ui/sidebar-item';
import { useDesktopWindow } from '@/lib/desktop-window-context';

const navigation = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'schedule', label: '日程', icon: CalendarDays },
  { id: 'projects', label: '项目', icon: FolderKanban },
  { id: 'stats', label: '统计', icon: ChartNoAxesCombined },
  { id: 'review', label: '复盘', icon: ClipboardList },
  { id: 'settings', label: '设置', icon: Settings },
];
type WorkspaceView = {
  active: string;
  selectedDate: string;
};
const WorkspaceViewContext = createContext<WorkspaceView>({
  active: 'home',
  selectedDate: '2026-08-23',
});
export const useWorkspaceView = () => useContext(WorkspaceViewContext);

export function AppShell({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState('home');
  const [selectedDate, setSelectedDate] = useState('2026-08-23');
  const { mode, restoreFromFloating, isFloatingIcon, isMiniToday } = useDesktopWindow();
  const activeLabel = navigation.find((item) => item.id === active)?.label;
  const shiftDate = (amount: number) =>
    setSelectedDate((current) =>
      format(addDays(new Date(`${current}T00:00:00`), amount), 'yyyy-MM-dd'),
    );
  const weekday = format(new Date(`${selectedDate}T00:00:00`), 'EE', { locale: zhCN });

  if (isFloatingIcon) {
    return (
      <button
        type="button"
        className="tl-window mode-floating-icon"
        aria-label="展开 Threadline 工作台"
        title="点击展开"
        onClick={() => void restoreFromFloating()}
      >
        <span className="tl-floating-icon-mark">T</span>
      </button>
    );
  }

  return (
    <div className={`tl-window mode-${mode}`}>
      <DesktopWindowControls compact={isMiniToday} />
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
            <h1>
              {isMiniToday
                ? '今日日程'
                : active === 'home'
                  ? '我的工作台'
                  : activeLabel}
            </h1>
            {!isMiniToday && (
              <p>
                {active === 'home' ? '安排、执行、记录今天' : '你的长期时间与任务数据'}
              </p>
            )}
          </div>
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
                  (
                    document.getElementById(
                      'workspace-date-picker',
                    ) as HTMLInputElement | null
                  )?.showPicker()
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
        </header>
        <WorkspaceViewContext.Provider value={{ active, selectedDate }}>
          {children}
        </WorkspaceViewContext.Provider>
      </main>
    </div>
  );
}
