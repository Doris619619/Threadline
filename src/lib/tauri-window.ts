/**
 * @fileoverview Tauri 主窗口适配器，将框架无关的窗口策略映射到 Tauri 2 原生 API。
 */

import {
  DEFAULT_WINDOW_CONFIGS,
  EDGE_TAB_SIZE,
  hasSufficientVisibleArea,
  hasWindowPosition,
  normalizeCompactWindowState,
  normalizeWindowStates,
  resolveSafeWindowState,
  type CompactPresentation,
  type CompactViewMode,
  type DesktopViewMode,
  type LogicalWorkArea,
  type WindowStateConfig,
} from '@/lib/desktop-window-policy';

export {
  DEFAULT_WINDOW_CONFIGS,
  EDGE_TAB_SIZE,
  hasSufficientVisibleArea,
  hasWindowPosition,
  normalizeCompactWindowState,
  normalizeWindowStates,
  resolveSafeWindowState,
};
export type { CompactPresentation, CompactViewMode, DesktopViewMode, LogicalWorkArea, WindowStateConfig };

/** 检查当前页面是否运行在 Tauri WebView 中。 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
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
    } else if (!collapsed && hasWindowPosition(target)) {
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
