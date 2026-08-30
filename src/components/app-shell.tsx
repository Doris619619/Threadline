/** @fileoverview 应用壳层：完整工作台导航、三态直达入口、紧凑窗口标题栏与右侧 edge tab。 */

'use client';

import {
  CalendarDays,
  ChartNoAxesCombined,
  ChevronUp,
  FolderKanban,
  Home,
  Minus,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  NotebookTabs,
  Orbit,
  Settings,
  X,
} from 'lucide-react';
import { createContext, useContext, useRef, useState } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { SidebarItem } from '@/components/ui/sidebar-item';
import { AccountDisclosure } from '@/features/auth/account-disclosure';
import { getUserIdentity } from '@/features/auth/user-identity';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { addLocalDateDays, getLocalDateKey, parseLocalDateKey } from '@/lib/local-date';

const navigation = [
  { id: 'home', label: '首页', icon: Home, description: '安排、执行、记录今天' },
  {
    id: 'calendar',
    label: '日历',
    icon: CalendarDays,
    description: '查看每日项目投入与历史日期',
  },
  {
    id: 'projects',
    label: '项目',
    icon: FolderKanban,
    description: '管理长期事项与任务归属',
  },
  {
    id: 'insights',
    label: '洞察',
    icon: ChartNoAxesCombined,
    description: '统一查看投入、估时与项目重心',
  },
  {
    id: 'records',
    label: '记录',
    icon: NotebookTabs,
    description: '搜索当前可可靠获得的历史记录',
  },
  {
    id: 'rhythm',
    label: '节律',
    icon: Orbit,
    description: '私密日期标记随账号同步，不进入 analytics、报告或记录',
  },
  {
    id: 'settings',
    label: '设置',
    icon: Settings,
    description: '账户、同步与数据边界',
  },
] as const;
export type WorkspaceViewId = (typeof navigation)[number]['id'];
type WorkspaceView = {
  active: WorkspaceViewId;
  selectedDate: string;
  setActive: (active: WorkspaceViewId) => void;
  setSelectedDate: (date: string) => void;
};
const WorkspaceViewContext = createContext<WorkspaceView>({
  active: 'home',
  selectedDate: getLocalDateKey(),
  setActive: () => undefined,
  setSelectedDate: () => undefined,
});
/** 读取完整工作台导航状态与当前工作日期。 */
export const useWorkspaceView = () => useContext(WorkspaceViewContext);

/** 渲染无边框紧凑窗口的唯一标题栏，并把清空控制限制在工作站模式。 */
export function CompactWindowHeader({
  onClearWorkstation,
}: {
  onClearWorkstation?: () => void;
}) {
  const { isMiniToday, isWorkstation, setMode, collapseCompactView, closeMainWindow } =
    useDesktopWindow();
  return (
    <header className={`compact-window-header${isWorkstation ? 'is-workstation' : ''}`}>
      <span className="compact-window-title">
        <CalendarDays size={20} />
        {isMiniToday ? '迷你今日' : '工作站'}
      </span>
      <div className="compact-window-actions">
        <button
          type="button"
          onClick={() => void setMode(isMiniToday ? 'workstation' : 'mini-today')}
        >
          {isMiniToday ? '工作站' : '今日'}
        </button>
        {isWorkstation && (
          <button type="button" onClick={onClearWorkstation}>
            清空
          </button>
        )}
        <button
          type="button"
          className="compact-collapse-button"
          onClick={() => void collapseCompactView()}
        >
          收起 <ChevronUp size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="desktop-close-button"
          aria-label="关闭窗口"
          title="关闭窗口"
          onClick={() => void closeMainWindow()}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

/** 渲染 Full 无边框窗口的连续拖拽区与独立的模式、最小化、关闭控制。 */
function FullWindowChrome() {
  const {
    isNativeDesktop,
    setMode,
    minimizeMainWindow,
    closeMainWindow,
    isMainWindowMaximized,
    toggleMainWindowMaximized,
  } = useDesktopWindow();
  if (!isNativeDesktop) return null;
  return (
    <header className="full-window-chrome">
      <span className="full-window-caption">Threadline</span>
      <div className="full-window-entries">
        <button type="button" onClick={() => void setMode('mini-today')}>
          迷你今日
        </button>
        <button type="button" onClick={() => void setMode('workstation')}>
          工作站
        </button>
        <button
          type="button"
          className="desktop-minimize-button"
          aria-label="最小化窗口"
          title="最小化到任务栏"
          onClick={() => void minimizeMainWindow()}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="desktop-maximize-button"
          aria-label={isMainWindowMaximized ? '还原窗口' : '最大化窗口'}
          title={isMainWindowMaximized ? '还原窗口' : '最大化窗口'}
          onClick={() => void toggleMainWindowMaximized()}
        >
          {isMainWindowMaximized ? (
            <Minimize2 size={16} aria-hidden="true" />
          ) : (
            <Maximize2 size={16} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="desktop-close-button"
          aria-label="关闭窗口"
          title="关闭窗口"
          onClick={() => void closeMainWindow()}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

/** 展示右侧窄标签；悬停有短容差后恢复最近紧凑视图。 */
function EdgeTab() {
  const { mode, restoreCompactView } = useDesktopWindow();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** 仅连续悬停后恢复，防止鼠标掠过屏幕右缘反复弹窗。 */
  const onPointerEnter = () => {
    timerRef.current = setTimeout(() => void restoreCompactView(), 260);
  };
  return (
    <button
      type="button"
      className="edge-tab"
      aria-label={`展开${mode === 'workstation' ? '工作站' : '迷你今日'}`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
      }}
      onClick={() => void restoreCompactView()}
    >
      <span>{mode === 'workstation' ? '工作站' : '迷你今日'}</span>
      <small>展开</small>
    </button>
  );
}

/** 根据 desktop presentation 渲染完整壳层、compact 壳层或 edge tab。 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<WorkspaceViewId>('home');
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateKey);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const { isCompact, isEdgeCollapsed, isNativeDesktop } = useDesktopWindow();
  const cloudRuntime = useOptionalCloudRuntime();
  const activeItem = navigation.find((item) => item.id === active) ?? navigation[0];
  /** 切换当前工作日期。 */
  const shiftDate = (amount: number) =>
    setSelectedDate((current) => addLocalDateDays(current, amount));
  const weekday = format(parseLocalDateKey(selectedDate), 'EE', { locale: zhCN });
  if (isEdgeCollapsed) return <EdgeTab />;
  return (
    <div className={`tl-window mode-${isCompact ? 'compact' : 'full'}`}>
      {!isCompact && isNativeDesktop && <FullWindowChrome />}
      <div className="tl-window-body">
        {!isCompact && (
          <aside className="tl-sidebar">
            <a className="tl-brand" href="#main-content">
              我的工作台
            </a>
            <nav className="tl-desktop-nav" aria-label="主导航">
              {navigation.map(({ id, label, icon: Icon }) => (
                <SidebarItem
                  key={id}
                  active={active === id}
                  onClick={() => {
                    setActive(id);
                    setMobileMoreOpen(false);
                  }}
                >
                  <Icon aria-hidden="true" size={18} />
                  {label}
                </SidebarItem>
              ))}
            </nav>
            <nav className="tl-mobile-nav" aria-label="移动端主导航">
              {navigation.slice(0, 4).map(({ id, label, icon: Icon }) => (
                <SidebarItem
                  key={id}
                  active={active === id}
                  onClick={() => {
                    setActive(id);
                    setMobileMoreOpen(false);
                  }}
                >
                  <Icon aria-hidden="true" size={18} />
                  {label}
                </SidebarItem>
              ))}
              <div className="tl-mobile-more">
                <button
                  type="button"
                  className={`tl-sidebar-item${navigation.slice(4).some((item) => item.id === active) ? 'is-active' : ''}`}
                  aria-expanded={mobileMoreOpen}
                  aria-controls="mobile-more-navigation"
                  onClick={() => setMobileMoreOpen((open) => !open)}
                >
                  <MoreHorizontal aria-hidden="true" size={18} />
                  更多
                </button>
                {mobileMoreOpen && (
                  <div id="mobile-more-navigation" className="tl-mobile-more-menu">
                    {navigation.slice(4).map(({ id, label, icon: Icon }) => (
                      <button
                        type="button"
                        key={id}
                        className={active === id ? 'is-active' : ''}
                        onClick={() => {
                          setActive(id);
                          setMobileMoreOpen(false);
                        }}
                      >
                        <Icon aria-hidden="true" size={18} />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </nav>
            {cloudRuntime && (
              <AccountDisclosure
                identity={getUserIdentity(cloudRuntime.user)}
                onOpenSettings={() => {
                  setActive('settings');
                  setMobileMoreOpen(false);
                }}
                signOut={cloudRuntime.signOut}
              />
            )}
          </aside>
        )}
        <main id="main-content" className="tl-main">
          {!isCompact && (
            <header className="tl-header">
              <div>
                <h1>{activeItem.label === '首页' ? '我的工作台' : activeItem.label}</h1>
                <p>{activeItem.description}</p>
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
                  <input
                    id="workspace-date-picker"
                    aria-label="工作区日期"
                    className="sr-only"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </div>
              </div>
            </header>
          )}
          <WorkspaceViewContext.Provider
            value={{ active, selectedDate, setActive, setSelectedDate }}
          >
            {children}
          </WorkspaceViewContext.Provider>
        </main>
      </div>
    </div>
  );
}
