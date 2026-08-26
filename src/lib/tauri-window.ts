/**
 * @fileoverview Tauri 主窗口桥接：三态几何恢复、可见性保护与原生窗口行为。
 */

export type DesktopViewMode = 'full' | 'mini-today' | 'workstation';
export type CompactViewMode = Exclude<DesktopViewMode, 'full'>;
export type CompactPresentation = 'expanded' | 'edge-collapsed';

export interface WindowStateConfig {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

/** 逻辑像素坐标系下的显示器工作区域。 */
export interface LogicalWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_WINDOW_CONFIGS: Record<DesktopViewMode, WindowStateConfig> = {
  full: { width: 1280, height: 840 },
  'mini-today': { width: 420, height: 660 },
  workstation: { width: 300, height: 420 },
};

const WINDOW_BOUNDS: Record<CompactViewMode, { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }> = {
  'mini-today': { minWidth: 340, maxWidth: 560, minHeight: 420, maxHeight: 820 },
  workstation: { minWidth: 260, maxWidth: 360, minHeight: 220, maxHeight: 640 },
};

const MINIMUM_VISIBLE_SIZE: Record<DesktopViewMode, { width: number; height: number }> = {
  full: { width: 240, height: 160 },
  'mini-today': { width: 80, height: 80 },
  workstation: { width: 80, height: 80 },
};

const WINDOW_MARGIN = 24;
export const EDGE_TAB_SIZE = { width: 42, height: 146 };

/** 检查当前页面是否运行在 Tauri WebView 中。 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

/** 将数值约束为闭区间内的整数。 */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.round(Math.min(maximum, Math.max(minimum, value)));
}

/** 判断持久化坐标是否为可用的逻辑像素位置。 */
function hasPosition(state: WindowStateConfig): state is WindowStateConfig & Required<Pick<WindowStateConfig, 'x' | 'y'>> {
  return Number.isFinite(state.x) && Number.isFinite(state.y);
}

/** 将紧凑视图的历史 geometry 夹在安全范围内，拒绝旧 v2 的巨大 Mini 与 72px 图标尺寸。 */
export function normalizeCompactWindowState(mode: CompactViewMode, state?: WindowStateConfig): WindowStateConfig {
  const fallback = DEFAULT_WINDOW_CONFIGS[mode];
  const bounds = WINDOW_BOUNDS[mode];
  const width = typeof state?.width === 'number' && Number.isFinite(state.width) ? state.width : fallback.width;
  const height = typeof state?.height === 'number' && Number.isFinite(state.height) ? state.height : fallback.height;
  const normalized = {
    width: clamp(width, bounds.minWidth, bounds.maxWidth),
    height: clamp(height, bounds.minHeight, bounds.maxHeight),
  };

  return state && hasPosition(state) ? { ...normalized, x: Math.round(state.x), y: Math.round(state.y) } : normalized;
}

/** 过滤所有持久化窗口配置，只允许当前三态的合法 geometry。 */
export function normalizeWindowStates(value: unknown): Partial<Record<DesktopViewMode, WindowStateConfig>> {
  if (!value || typeof value !== 'object') return {};

  const states = value as Partial<Record<DesktopViewMode, WindowStateConfig>>;
  const full = states.full;
  const normalizedFull = full && Number.isFinite(full.width) && Number.isFinite(full.height) && full.width >= 800 && full.height >= 560
    ? { width: Math.round(full.width), height: Math.round(full.height), ...(hasPosition(full) ? { x: Math.round(full.x), y: Math.round(full.y) } : {}) }
    : undefined;

  return {
    ...(normalizedFull ? { full: normalizedFull } : {}),
    'mini-today': normalizeCompactWindowState('mini-today', states['mini-today']),
    workstation: normalizeCompactWindowState('workstation', states.workstation),
  };
}

/** 判断窗口与任一工作区域是否保留足够的可点击可见矩形。 */
export function hasSufficientVisibleArea(mode: DesktopViewMode, state: WindowStateConfig, workAreas: LogicalWorkArea[]): boolean {
  if (!hasPosition(state)) return false;

  const minimum = MINIMUM_VISIBLE_SIZE[mode];
  return workAreas.some((area) => {
    const visibleWidth = Math.max(0, Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x));
    const visibleHeight = Math.max(0, Math.min(state.y + state.height, area.y + area.height) - Math.max(state.y, area.y));
    return visibleWidth >= minimum.width && visibleHeight >= minimum.height;
  });
}

/** 为当前显示器计算居中或右上停靠的保底展开窗口坐标。 */
function getFallbackWindowState(mode: DesktopViewMode, state: WindowStateConfig, area: LogicalWorkArea): WindowStateConfig {
  const width = Math.min(state.width, Math.max(1, area.width - WINDOW_MARGIN * 2));
  const height = Math.min(state.height, Math.max(1, area.height - WINDOW_MARGIN * 2));
  const x = mode === 'full'
    ? area.x + Math.max(WINDOW_MARGIN, (area.width - width) / 2)
    : area.x + Math.max(WINDOW_MARGIN, area.width - width - WINDOW_MARGIN);
  const y = mode === 'full'
    ? area.y + Math.max(WINDOW_MARGIN, (area.height - height) / 2)
    : area.y + WINDOW_MARGIN;

  return { width: Math.round(width), height: Math.round(height), x: Math.round(x), y: Math.round(y) };
}

/**
 * 恢复持久化 geometry 前校验其可见性；缺失屏幕、-32000 最小化哨兵值或 DPI 失配均回退到当前工作区。
 * 输入和输出始终为 logical pixel，避免 125% 等缩放下混用 physical pixel。
 */
export function resolveSafeWindowState(mode: DesktopViewMode, state: WindowStateConfig, workAreas: LogicalWorkArea[], preferredArea?: LogicalWorkArea | null): WindowStateConfig {
  if (hasSufficientVisibleArea(mode, state, workAreas)) return state;

  const fallbackArea = preferredArea ?? workAreas[0];
  return fallbackArea ? getFallbackWindowState(mode, state, fallbackArea) : { ...state };
}

/** 容错执行原生窗口调用；浏览器预览与权限受限环境仍可继续渲染 UI。 */
async function applyWindowAction(name: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.warn(`[TauriWindowBridge] ${name} error:`, error);
  }
}

/** 读取全部显示器工作区，并统一转换为逻辑像素。 */
async function getMonitorWorkAreas(): Promise<{ workAreas: LogicalWorkArea[]; preferredArea: LogicalWorkArea | null }> {
  const { availableMonitors, currentMonitor, primaryMonitor } = await import('@tauri-apps/api/window');
  const toWorkArea = (monitor: Awaited<ReturnType<typeof currentMonitor>>): LogicalWorkArea | null => {
    if (!monitor) return null;
    const position = monitor.workArea.position.toLogical(monitor.scaleFactor);
    const size = monitor.workArea.size.toLogical(monitor.scaleFactor);
    return { x: position.x, y: position.y, width: size.width, height: size.height };
  };
  const [monitors, current, primary] = await Promise.all([availableMonitors(), currentMonitor(), primaryMonitor()]);
  const workAreas = monitors.map(toWorkArea).filter((area): area is LogicalWorkArea => area !== null);
  const preferredArea = toWorkArea(current) ?? toWorkArea(primary) ?? workAreas[0] ?? null;
  return { workAreas, preferredArea };
}

/** 将同一个主窗口取消最小化、显示并置于前台。 */
export async function bringDesktopWindowToFront(): Promise<void> {
  if (!isTauriEnvironment()) return;

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    await applyWindowAction('unminimize', () => appWindow.unminimize());
    await applyWindowAction('show', () => appWindow.show());
    await applyWindowAction('focus', () => appWindow.setFocus());
  } catch (error) {
    console.warn('[TauriWindowBridge] bringDesktopWindowToFront error:', error);
  }
}

/** 按当前 view 和 presentation 改变同一个主窗口，不创建或销毁 WebView。 */
export async function applyDesktopWindowView(mode: DesktopViewMode, presentation: CompactPresentation, savedStates: Partial<Record<DesktopViewMode, WindowStateConfig>>): Promise<void> {
  if (!isTauriEnvironment()) return;

  try {
    const { getCurrentWindow, LogicalPosition, LogicalSize } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    const collapsed = presentation === 'edge-collapsed' && mode !== 'full';
    const persisted = mode === 'full'
      ? savedStates.full ?? DEFAULT_WINDOW_CONFIGS.full
      : normalizeCompactWindowState(mode, savedStates[mode]);
    const { workAreas, preferredArea } = await getMonitorWorkAreas();
    const target = resolveSafeWindowState(mode, persisted, workAreas, preferredArea);

    await bringDesktopWindowToFront();
    await applyWindowAction('unmaximize', () => appWindow.unmaximize());
    await applyWindowAction('set always on top', () => appWindow.setAlwaysOnTop(mode !== 'full'));
    await applyWindowAction('set decorations', () => appWindow.setDecorations(!collapsed));
    await applyWindowAction('set shadow', () => appWindow.setShadow(!collapsed));
    await applyWindowAction('set resizable', () => appWindow.setResizable(mode === 'full' || !collapsed));
    await applyWindowAction('set maximizable', () => appWindow.setMaximizable(mode === 'full'));

    const size = collapsed ? EDGE_TAB_SIZE : target;
    await applyWindowAction('set minimum size', () => appWindow.setMinSize(new LogicalSize(size.width, size.height)));
    await applyWindowAction('set maximum size', () => appWindow.setMaxSize(collapsed ? new LogicalSize(size.width, size.height) : null));
    await applyWindowAction('set size', () => appWindow.setSize(new LogicalSize(size.width, size.height)));

    if (collapsed && preferredArea) {
      const x = preferredArea.x + preferredArea.width - EDGE_TAB_SIZE.width;
      const y = preferredArea.y + Math.max(32, (preferredArea.height - EDGE_TAB_SIZE.height) / 2);
      await applyWindowAction('dock right edge tab', () => appWindow.setPosition(new LogicalPosition(Math.round(x), Math.round(y))));
    } else if (!collapsed && hasPosition(target)) {
      await applyWindowAction('restore safe position', () => appWindow.setPosition(new LogicalPosition(target.x, target.y)));
    }

    await bringDesktopWindowToFront();
  } catch (error) {
    console.warn('[TauriWindowBridge] applyDesktopWindowView error:', error);
  }
}

/** 读取逻辑尺寸和位置；最小化状态不写回持久化 geometry。 */
export async function getCurrentWindowState(): Promise<WindowStateConfig | null> {
  if (!isTauriEnvironment()) return null;

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    if (await appWindow.isMinimized()) return null;

    const [size, position, factor] = await Promise.all([appWindow.innerSize(), appWindow.outerPosition(), appWindow.scaleFactor()]);
    return {
      width: Math.round(size.width / factor),
      height: Math.round(size.height / factor),
      x: Math.round(position.x / factor),
      y: Math.round(position.y / factor),
    };
  } catch (error) {
    console.warn('[TauriWindowBridge] getCurrentWindowState error:', error);
    return null;
  }
}

/** 从明确的紧凑窗口标题栏启动原生拖动，避免内容区的任务操作被劫持。 */
export async function startTauriDragging(): Promise<void> {
  if (!isTauriEnvironment()) return;

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  } catch (error) {
    console.warn('[TauriWindowBridge] startDragging error:', error);
  }
}

/** 订阅移动与缩放事件，供 Context 分开记忆各紧凑视图的 geometry。 */
export async function listenDesktopWindowGeometry(onChange: () => void): Promise<() => void> {
  if (!isTauriEnvironment()) return () => undefined;

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const [unlistenMove, unlistenResize] = await Promise.all([getCurrentWindow().onMoved(onChange), getCurrentWindow().onResized(onChange)]);
    return () => {
      unlistenMove();
      unlistenResize();
    };
  } catch (error) {
    console.warn('[TauriWindowBridge] listenDesktopWindowGeometry error:', error);
    return () => undefined;
  }
}
