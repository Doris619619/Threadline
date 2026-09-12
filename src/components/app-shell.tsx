/** @fileoverview 应用壳层：完整工作台导航、工作站入口、紧凑窗口标题栏与右侧 edge tab。 */

'use client';

import {
  CalendarDays,
  ChartNoAxesCombined,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Home,
  Sprout,
  Minus,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Orbit,
  Settings,
  Spline,
  X,
} from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { SidebarItem } from '@/components/ui/sidebar-item';
import { AccountDisclosure } from '@/features/auth/account-disclosure';
import { getUserIdentity } from '@/features/auth/user-identity';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { addLocalDateDays, getLocalDateKey, parseLocalDateKey } from '@/lib/local-date';
import { cn } from '@/lib/cn';
import { ThemeIllustration } from '@/features/appearance/theme-illustration';
import { CottageNavIcon } from '@/features/appearance/cottage-sprite';
import { CottageCompanion } from '@/features/appearance/cottage-companion';
import { DesktopUpdateEntry } from '@/features/desktop-update/update-entry';

/** Open the native date popup for the full visible control; unsupported/restricted browsers keep their native input behavior. */
function openWorkspaceDatePicker(input: HTMLInputElement): boolean {
  if (typeof input.showPicker !== 'function') return false;
  try {
    input.showPicker();
    return true;
  } catch {
    return false;
  }
}

const navigation = [
  { id: 'home', label: '首页', icon: Home, description: '安排、执行、记录今天' },
  {
    id: 'calendar',
    label: '规划',
    icon: CalendarDays,
    description: '查看未来任务与跨日安排',
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
    id: 'habits',
    label: '习惯',
    icon: Sprout,
    description: '记录作息与当天工作效率',
  },
  {
    id: 'rhythm',
    label: '节律',
    icon: Orbit,
    description: '记录生理期开始与结束，随账号同步，不进入洞察与报告',
  },
  {
    id: 'settings',
    label: '设置',
    icon: Settings,
    description: '账户、同步与数据边界',
  },
] as const;
const mobilePrimaryIds = new Set(['home', 'calendar', 'projects', 'habits']);
const mobilePrimary = navigation.filter((item) => mobilePrimaryIds.has(item.id));
const mobileSecondary = navigation.filter((item) => !mobilePrimaryIds.has(item.id));
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

/** 渲染紧凑标题栏与轻量更新入口，并把清空控制限制在工作站模式。 */
export function CompactWindowHeader({
  onClearWorkstation,
}: {
  onClearWorkstation?: () => void;
}) {
  const { collapseCompactView, closeMainWindow } = useDesktopWindow();
  return (
    <header className="compact-window-header is-workstation">
      <span className="compact-window-title">
        <CalendarDays size={12} />
        工作站
      </span>
      <DesktopUpdateEntry />
      <div className="compact-window-actions">
        <button type="button" onClick={onClearWorkstation}>
          清空
        </button>
        <button
          type="button"
          className="compact-collapse-button"
          onClick={() => void collapseCompactView()}
        >
          收起 <ChevronUp size={10} aria-hidden="true" />
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

/** 渲染 Full 标题栏的拖拽区、小型更新入口与独立窗口控制。 */
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
        <DesktopUpdateEntry />
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

/** Renderer 回退入口仅响应点击，悬停不改变窗口形态。 */
function EdgeTab() {
  const { restoreCompactView } = useDesktopWindow();
  return (
    <button
      type="button"
      className="edge-tab"
      onClick={() => void restoreCompactView()}
      aria-label="展开紧凑工作台"
    >
      <span>Threadline</span>
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
  const usesDedicatedProjectHeader = active === 'projects';
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
              <span className="tl-brand-mark" aria-hidden="true">
                <Spline size={16} strokeWidth={2.4} />
              </span>
              Threadline
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
                  <CottageNavIcon name={id}>
                    <Icon aria-hidden="true" size={18} />
                  </CottageNavIcon>
                  {label}
                </SidebarItem>
              ))}
            </nav>
            <nav className="tl-mobile-nav" aria-label="移动端主导航">
              {mobilePrimary.map(({ id, label, icon: Icon }) => (
                <SidebarItem
                  key={id}
                  active={active === id}
                  onClick={() => {
                    setActive(id);
                    setMobileMoreOpen(false);
                  }}
                >
                  <CottageNavIcon name={id}>
                    <Icon aria-hidden="true" size={18} />
                  </CottageNavIcon>
                  {label}
                </SidebarItem>
              ))}
              <div className="tl-mobile-more">
                <button
                  type="button"
                  className={cn(
                    'tl-sidebar-item',
                    mobileSecondary.some((item) => item.id === active) && 'is-active',
                  )}
                  aria-expanded={mobileMoreOpen}
                  aria-controls="mobile-more-navigation"
                  onClick={() => setMobileMoreOpen((open) => !open)}
                >
                  <MoreHorizontal aria-hidden="true" size={18} />
                  更多
                </button>
                {mobileMoreOpen && (
                  <div id="mobile-more-navigation" className="tl-mobile-more-menu">
                    {mobileSecondary.map(({ id, label, icon: Icon }) => (
                      <button
                        type="button"
                        key={id}
                        className={active === id ? 'is-active' : ''}
                        onClick={() => {
                          setActive(id);
                          setMobileMoreOpen(false);
                        }}
                      >
                        <CottageNavIcon name={id}>
                          <Icon aria-hidden="true" size={18} />
                        </CottageNavIcon>
                        {label}
                      </button>
                    ))}
                    <CottageCompanion compact view={active} />
                  </div>
                )}
              </div>
            </nav>
            <CottageCompanion view={active} />
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
        <main id="main-content" className="tl-main" data-workspace-view={active}>
          {!isCompact &&
            !usesDedicatedProjectHeader &&
            active !== 'calendar' &&
            active !== 'habits' &&
            active !== 'settings' && (
              <header className="tl-header" data-home={active === 'home'}>
                <div>
                  <h1>
                    {activeItem.label === '首页' ? '我的工作台' : activeItem.label}
                  </h1>
                  <p>{activeItem.description}</p>
                </div>
                {active === 'home' && (
                  <ThemeIllustration className="home-theme-illustration" />
                )}
                <div className="tl-header-actions">
                  {active !== 'rhythm' && (
                    <div className="tl-date">
                      <div className="tl-date-select">
                        <label
                          className="tl-date-picker"
                          htmlFor="workspace-date-picker"
                        >
                          <CalendarDays size={18} aria-hidden="true" />
                          <time dateTime={selectedDate}>
                            {selectedDate}　{weekday}
                          </time>
                        </label>
                        <input
                          id="workspace-date-picker"
                          aria-label="工作区日期"
                          className="tl-native-date-picker"
                          type="date"
                          value={selectedDate}
                          onClick={(event) => {
                            if (openWorkspaceDatePicker(event.currentTarget))
                              event.preventDefault();
                          }}
                          onKeyDown={(event) => {
                            if (
                              (event.key === 'Enter' || event.key === ' ') &&
                              openWorkspaceDatePicker(event.currentTarget)
                            )
                              event.preventDefault();
                          }}
                          onChange={(event) => {
                            if (event.target.value) setSelectedDate(event.target.value);
                          }}
                        />
                      </div>
                      <div className="tl-date-step">
                        <button aria-label="前一天" onClick={() => shiftDate(-1)}>
                          <ChevronLeft size={18} aria-hidden="true" />
                        </button>
                        <button aria-label="后一天" onClick={() => shiftDate(1)}>
                          <ChevronRight size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
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
