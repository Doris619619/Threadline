/**
 * @fileoverview Tauri 桌面窗口桥接，负责三态窗口的原生装饰、尺寸、位置与置顶行为。
 */

export type DesktopWindowMode = 'full' | 'mini-today' | 'floating-icon';

export interface WindowStateConfig {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export const DEFAULT_WINDOW_CONFIGS: Record<DesktopWindowMode, WindowStateConfig> = {
  full: { width: 1280, height: 840 },
  'mini-today': { width: 392, height: 600 },
  'floating-icon': { width: 72, height: 72 },
};

/** 检查当前页面是否运行在 Tauri WebView 中。 */
export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

/**
 * 将窗口切换到指定形态；完整与迷你使用系统标题栏，悬浮图标保持无边框。
 */
export async function applyDesktopWindowMode(
  mode: DesktopWindowMode,
  savedStates?: Partial<Record<DesktopWindowMode, WindowStateConfig>>,
): Promise<void> {
  if (!isTauriEnvironment()) return;

  try {
    const { getCurrentWindow, LogicalPosition, LogicalSize } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    const target = savedStates?.[mode] ?? DEFAULT_WINDOW_CONFIGS[mode];
    const isFloating = mode === 'floating-icon';
    const isMini = mode === 'mini-today';

    await appWindow.unmaximize();
    await appWindow.setAlwaysOnTop(isFloating || isMini);
    await appWindow.setDecorations(!isFloating);
    await appWindow.setShadow(!isFloating);
    await appWindow.setResizable(!isFloating);
    await appWindow.setMaximizable(mode === 'full');
    await appWindow.setMinSize(
      isFloating
        ? new LogicalSize(target.width, target.height)
        : new LogicalSize(isMini ? 320 : 960, isMini ? 360 : 640),
    );
    await appWindow.setMaxSize(isFloating ? new LogicalSize(target.width, target.height) : null);
    await appWindow.setSize(new LogicalSize(target.width, target.height));
    if (typeof target.x === 'number' && typeof target.y === 'number') {
      await appWindow.setPosition(new LogicalPosition(target.x, target.y));
    }
  } catch (error) {
    console.warn('[TauriWindowBridge] applyDesktopWindowMode error:', error);
  }
}

/** 读取当前原生窗口的逻辑尺寸与外框位置，供每种形态独立保存。 */
export async function getCurrentWindowState(): Promise<WindowStateConfig | null> {
  if (!isTauriEnvironment()) return null;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    const [size, position, factor] = await Promise.all([
      appWindow.innerSize(),
      appWindow.outerPosition(),
      appWindow.scaleFactor(),
    ]);
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

/** 开始无边框悬浮图标的原生窗口拖动。 */
export async function startTauriDragging(): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  } catch (error) {
    console.warn('[TauriWindowBridge] startDragging error:', error);
  }
}

/**
 * 临时放大悬浮窗口以展示右键菜单；关闭后恢复用户保存的图标规格。
 */
export async function setFloatingContextMenuOpen(
  open: boolean,
  savedState?: WindowStateConfig,
): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    const iconSize = savedState?.width ?? DEFAULT_WINDOW_CONFIGS['floating-icon'].width;
    const size = open ? new LogicalSize(264, 216) : new LogicalSize(iconSize, iconSize);
    await appWindow.setMinSize(size);
    await appWindow.setMaxSize(size);
    await appWindow.setSize(size);
  } catch (error) {
    console.warn('[TauriWindowBridge] setFloatingContextMenuOpen error:', error);
  }
}

/**
 * 订阅移动与缩放事件。非 Tauri 环境返回空取消函数，便于浏览器预览复用。
 */
export async function listenDesktopWindowGeometry(
  onChange: () => void,
): Promise<() => void> {
  if (!isTauriEnvironment()) return () => undefined;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    const [unlistenMove, unlistenResize] = await Promise.all([
      appWindow.onMoved(onChange),
      appWindow.onResized(onChange),
    ]);
    return () => {
      unlistenMove();
      unlistenResize();
    };
  } catch (error) {
    console.warn('[TauriWindowBridge] listenDesktopWindowGeometry error:', error);
    return () => undefined;
  }
}
