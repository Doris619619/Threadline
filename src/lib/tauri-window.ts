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

export const FLOATING_ICON_SIZES = [56, 72, 88] as const;

/**
 * 过滤悬浮图标的持久化尺寸，历史误存的工作台宽高不会再让图标窗口变成长条。
 */
export function normalizeFloatingWindowState(
  state?: WindowStateConfig,
): WindowStateConfig {
  const fallback = DEFAULT_WINDOW_CONFIGS['floating-icon'];
  const isSupportedSize = FLOATING_ICON_SIZES.includes(
    state?.width as (typeof FLOATING_ICON_SIZES)[number],
  );
  const size = isSupportedSize && state && state.height === state.width ? state.width : fallback.width;
  return {
    width: size,
    height: size,
    ...(typeof state?.x === 'number' && typeof state?.y === 'number'
      ? { x: state.x, y: state.y }
      : {}),
  };
}

/**
 * 执行单项原生窗口设置；某项权限或平台能力不可用时记录警告，但不阻断尺寸等关键后续设置。
 */
async function applyWindowAction(name: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.warn(`[TauriWindowBridge] ${name} error:`, error);
  }
}

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
    const isFloating = mode === 'floating-icon';
    const isMini = mode === 'mini-today';
    const target = isFloating
      ? normalizeFloatingWindowState(savedStates?.['floating-icon'])
      : savedStates?.[mode] ?? DEFAULT_WINDOW_CONFIGS[mode];

    await applyWindowAction('unmaximize', () => appWindow.unmaximize());
    await applyWindowAction('set always on top', () => appWindow.setAlwaysOnTop(isFloating || isMini));
    await applyWindowAction('set decorations', () => appWindow.setDecorations(!isFloating));
    await applyWindowAction('set shadow', () => appWindow.setShadow(!isFloating));
    await applyWindowAction('set resizable', () => appWindow.setResizable(!isFloating));
    await applyWindowAction('set maximizable', () => appWindow.setMaximizable(mode === 'full'));
    await applyWindowAction('set minimum size', () =>
      appWindow.setMinSize(
        isFloating
          ? new LogicalSize(target.width, target.height)
          : new LogicalSize(isMini ? 320 : 960, isMini ? 360 : 640),
      ),
    );
    await applyWindowAction('set maximum size', () =>
      appWindow.setMaxSize(isFloating ? new LogicalSize(target.width, target.height) : null),
    );
    await applyWindowAction('set size', () =>
      appWindow.setSize(new LogicalSize(target.width, target.height)),
    );
    if (typeof target.x === 'number' && typeof target.y === 'number') {
      const position = new LogicalPosition(target.x, target.y);
      await applyWindowAction('set position', () =>
        appWindow.setPosition(position),
      );
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
    const iconSize = normalizeFloatingWindowState(savedState).width;
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
