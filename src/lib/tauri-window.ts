/**
 * @fileoverview Tauri 主窗口桥接：三种视图的尺寸保护、右侧收起定位与原生窗口行为。
 */

export type DesktopViewMode = 'full' | 'mini-today' | 'workstation';
export type CompactViewMode = Exclude<DesktopViewMode, 'full'>;
export type CompactPresentation = 'expanded' | 'edge-collapsed';

export interface WindowStateConfig { width: number; height: number; x?: number; y?: number; }

export const DEFAULT_WINDOW_CONFIGS: Record<DesktopViewMode, WindowStateConfig> = {
  full: { width: 1280, height: 840 }, 'mini-today': { width: 420, height: 660 }, workstation: { width: 300, height: 420 },
};
const WINDOW_BOUNDS: Record<CompactViewMode, { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }> = {
  'mini-today': { minWidth: 340, maxWidth: 560, minHeight: 420, maxHeight: 820 }, workstation: { minWidth: 260, maxWidth: 360, minHeight: 220, maxHeight: 640 },
};
export const EDGE_TAB_SIZE = { width: 42, height: 146 };

/** 检查当前页面是否运行在 Tauri WebView 中。 */
export function isTauriEnvironment(): boolean { return typeof window !== 'undefined' && Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__); }

/** 将紧凑视图的历史 geometry 夹在安全范围内，拒绝旧 v2 的巨大 Mini 与 72px 图标尺寸。 */
export function normalizeCompactWindowState(mode: CompactViewMode, state?: WindowStateConfig): WindowStateConfig {
  const fallback = DEFAULT_WINDOW_CONFIGS[mode]; const bounds = WINDOW_BOUNDS[mode];
  const width = typeof state?.width === 'number' && Number.isFinite(state.width) ? state.width : fallback.width;
  const height = typeof state?.height === 'number' && Number.isFinite(state.height) ? state.height : fallback.height;
  return { width: Math.round(Math.min(bounds.maxWidth, Math.max(bounds.minWidth, width))), height: Math.round(Math.min(bounds.maxHeight, Math.max(bounds.minHeight, height))), ...(typeof state?.x === 'number' && typeof state?.y === 'number' ? { x: state.x, y: state.y } : {}) };
}

/** 过滤所有持久化窗口配置，只允许当前三态的合法 geometry。 */
export function normalizeWindowStates(value: unknown): Partial<Record<DesktopViewMode, WindowStateConfig>> {
  if (!value || typeof value !== 'object') return {};
  const states = value as Partial<Record<DesktopViewMode, WindowStateConfig>>; const full = states.full;
  return { ...(full && Number.isFinite(full.width) && Number.isFinite(full.height) && full.width >= 800 && full.height >= 560 ? { full } : {}), 'mini-today': normalizeCompactWindowState('mini-today', states['mini-today']), workstation: normalizeCompactWindowState('workstation', states.workstation) };
}

/** 容错执行原生窗口调用；浏览器预览与权限受限环境仍可继续渲染 UI。 */
async function applyWindowAction(name: string, action: () => Promise<void>): Promise<void> { try { await action(); } catch (error) { console.warn(`[TauriWindowBridge] ${name} error:`, error); } }

/** 取得当前窗口所在显示器的逻辑工作区域，供右侧停靠而非基于单一屏幕宽度计算。 */
async function getMonitorWorkArea() {
  const { currentMonitor } = await import('@tauri-apps/api/window'); const monitor = await currentMonitor(); if (!monitor) return null;
  return { position: monitor.workArea.position.toLogical(monitor.scaleFactor), size: monitor.workArea.size.toLogical(monitor.scaleFactor) };
}

/** 按当前 view 和 presentation 改变同一个主窗口，不创建或销毁 WebView。 */
export async function applyDesktopWindowView(mode: DesktopViewMode, presentation: CompactPresentation, savedStates: Partial<Record<DesktopViewMode, WindowStateConfig>>): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const { getCurrentWindow, LogicalPosition, LogicalSize } = await import('@tauri-apps/api/window'); const appWindow = getCurrentWindow();
    const collapsed = presentation === 'edge-collapsed' && mode !== 'full'; const target = mode === 'full' ? (savedStates.full ?? DEFAULT_WINDOW_CONFIGS.full) : normalizeCompactWindowState(mode, savedStates[mode]);
    await applyWindowAction('unmaximize', () => appWindow.unmaximize()); await applyWindowAction('set always on top', () => appWindow.setAlwaysOnTop(mode !== 'full')); await applyWindowAction('set decorations', () => appWindow.setDecorations(!collapsed)); await applyWindowAction('set shadow', () => appWindow.setShadow(!collapsed)); await applyWindowAction('set resizable', () => appWindow.setResizable(mode === 'full' || !collapsed)); await applyWindowAction('set maximizable', () => appWindow.setMaximizable(mode === 'full'));
    const size = collapsed ? EDGE_TAB_SIZE : target; await applyWindowAction('set minimum size', () => appWindow.setMinSize(new LogicalSize(size.width, size.height))); await applyWindowAction('set maximum size', () => appWindow.setMaxSize(collapsed ? new LogicalSize(size.width, size.height) : null)); await applyWindowAction('set size', () => appWindow.setSize(new LogicalSize(size.width, size.height)));
    if (collapsed) { const workArea = await getMonitorWorkArea(); if (workArea) await applyWindowAction('dock right edge tab', () => appWindow.setPosition(new LogicalPosition(Math.round(workArea.position.x + workArea.size.width - EDGE_TAB_SIZE.width), Math.round(workArea.position.y + Math.max(32, (workArea.size.height - EDGE_TAB_SIZE.height) / 2))))); }
    else if (typeof target.x === 'number' && typeof target.y === 'number') { const { x, y } = target; await applyWindowAction('restore position', () => appWindow.setPosition(new LogicalPosition(x, y))); }
  } catch (error) { console.warn('[TauriWindowBridge] applyDesktopWindowView error:', error); }
}

/** 读取逻辑尺寸和位置，跨 DPI 显示器持久化时统一为 logical pixel。 */
export async function getCurrentWindowState(): Promise<WindowStateConfig | null> {
  if (!isTauriEnvironment()) return null;
  try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); const appWindow = getCurrentWindow(); const [size, position, factor] = await Promise.all([appWindow.innerSize(), appWindow.outerPosition(), appWindow.scaleFactor()]); return { width: Math.round(size.width / factor), height: Math.round(size.height / factor), x: Math.round(position.x / factor), y: Math.round(position.y / factor) }; } catch (error) { console.warn('[TauriWindowBridge] getCurrentWindowState error:', error); return null; }
}

/** 从明确的紧凑窗口标题栏启动原生拖动，避免内容区的任务操作被劫持。 */
export async function startTauriDragging(): Promise<void> { if (!isTauriEnvironment()) return; try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().startDragging(); } catch (error) { console.warn('[TauriWindowBridge] startDragging error:', error); } }

/** 订阅移动与缩放事件，供 Context 分开记忆各紧凑视图的 geometry。 */
export async function listenDesktopWindowGeometry(onChange: () => void): Promise<() => void> {
  if (!isTauriEnvironment()) return () => undefined;
  try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); const [unlistenMove, unlistenResize] = await Promise.all([getCurrentWindow().onMoved(onChange), getCurrentWindow().onResized(onChange)]); return () => { unlistenMove(); unlistenResize(); }; } catch (error) { console.warn('[TauriWindowBridge] listenDesktopWindowGeometry error:', error); return () => undefined; }
}
