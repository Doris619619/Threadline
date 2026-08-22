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
import { SidebarItem } from '@/components/ui/sidebar-item';

const navigation = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'schedule', label: '日程', icon: CalendarDays },
  { id: 'projects', label: '项目', icon: FolderKanban },
  { id: 'stats', label: '统计', icon: ChartNoAxesCombined },
  { id: 'review', label: '复盘', icon: ClipboardList },
  { id: 'settings', label: '设置', icon: Settings },
];
const WorkspaceViewContext = createContext<{ active: string }>({ active: 'home' });
export const useWorkspaceView = () => useContext(WorkspaceViewContext);

export function AppShell({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState('home');
  const activeLabel = navigation.find((item) => item.id === active)?.label;
  return (
    <div className="tl-window">
      <div className="tl-window-controls" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <aside className="tl-sidebar">
        <a className="tl-brand" href="#main-content">
          我的工作台
        </a>
        <nav aria-label="主导航">
          {navigation.map(({ id, label, icon: Icon }) => (
            <SidebarItem key={id} active={active === id} onClick={() => setActive(id)}>
              <Icon aria-hidden="true" size={22} />
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
      <main id="main-content" className="tl-main">
        <header className="tl-header">
          <div>
            <h1>{active === 'home' ? '我的工作台' : activeLabel}</h1>
            <p>
              {active === 'home' ? '安排、执行、记录今天' : '你的长期时间与任务数据'}
            </p>
          </div>
          <div className="tl-date">
            <button aria-label="前一天">‹</button>
            <time dateTime="2026-08-23">2026-08-23　周日</time>
            <button aria-label="后一天">›</button>
            <button aria-label="选择日期">
              <CalendarDays size={20} />
            </button>
          </div>
        </header>
        <WorkspaceViewContext.Provider value={{ active }}>
          {children}
        </WorkspaceViewContext.Provider>
      </main>
    </div>
  );
}
