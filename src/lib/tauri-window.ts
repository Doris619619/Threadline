/**
 * @fileoverview 桌面多窗口形态定义与 Tauri 窗口尺寸/位置桥接工具。
 * 支持 Full（完整工作台）、Mini Today（迷你今日日程）、Floating Icon（悬浮图标）三种模式及状态记忆。
 */

export type DesktopWindowMode = 'full' | 'mini-today' | 'floating-icon';

export interface WindowStateConfig {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export const DEFAULT_WINDOW_CONFIGS: Record<DesktopWindowMode, WindowStateConfig> = {
  full: {
    width: 1200,
    height: 820,
  },
  'mini-today': {
    width: 380,
    height: 620,
  },
  'floating-icon': {
    width: 52,
    height: 52,
  },
};

/**
 * 检查当前是否在 Tauri 桌面运行时环境中。
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

/**
 * 设置 Tauri 窗口大小与位置，并处理置顶与无边框属性。
 */
export async function applyDesktopWindowMode(
  mode: DesktopWindowMode,
  savedStates?: Partial<Record<DesktopWindowMode, WindowStateConfig>>,
): Promise<void> {
  if (!isTauriEnvironment()) return;

  try {
    const { getCurrentWindow, LogicalSize, LogicalPosition } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();

    const targetConfig = savedStates?.[mode] ?? DEFAULT_WINDOW_CONFIGS[mode];

    if (mode === 'floating-icon') {
      await appWindow.setAlwaysOnTop(true);
      await appWindow.setDecorations(false);
      await appWindow.setShadow(false);
      await appWindow.setSize(new LogicalSize(targetConfig.width, targetConfig.height));
      if (typeof targetConfig.x === 'number' && typeof targetConfig.y === 'number') {
        await appWindow.setPosition(new LogicalPosition(targetConfig.x, targetConfig.y));
      }
    } else if (mode === 'mini-today') {
      await appWindow.setAlwaysOnTop(true);
      await appWindow.setDecorations(false);
      await appWindow.setShadow(true);
      await appWindow.setSize(new LogicalSize(targetConfig.width, targetConfig.height));
      if (typeof targetConfig.x === 'number' && typeof targetConfig.y === 'number') {
        await appWindow.setPosition(new LogicalPosition(targetConfig.x, targetConfig.y));
      }
    } else {
      // full 模式
      await appWindow.setAlwaysOnTop(false);
      await appWindow.setDecorations(false); // 保持统一定制 header 风格
      await appWindow.setShadow(true);
      await appWindow.setSize(new LogicalSize(targetConfig.width, targetConfig.height));
      if (typeof targetConfig.x === 'number' && typeof targetConfig.y === 'number') {
        await appWindow.setPosition(new LogicalPosition(targetConfig.x, targetConfig.y));
      }
    }
  } catch (error) {
    console.warn('[TauriWindowBridge] applyDesktopWindowMode error:', error);
  }
}

/**
 * 获取当前窗口尺寸与位置以供持久化保存。
 */
export async function getCurrentWindowState(): Promise<WindowStateConfig | null> {
  if (!isTauriEnvironment()) return null;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    const size = await appWindow.innerSize();
    const position = await appWindow.outerPosition();
    const factor = await appWindow.scaleFactor();

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

/**
 * 开始原生拖拽窗口
 */
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
 * 最小化窗口
 */
export async function minimizeTauriWindow(): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  } catch (error) {
    console.warn('[TauriWindowBridge] minimize error:', error);
  }
}

/**
 * 最大化 / 还原窗口
 */
export async function toggleMaximizeTauriWindow(): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    const isMax = await appWindow.isMaximized();
    if (isMax) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  } catch (error) {
    console.warn('[TauriWindowBridge] toggleMaximize error:', error);
  }
}

/**
 * 关闭窗口
 */
export async function closeTauriWindow(): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  } catch (error) {
    console.warn('[TauriWindowBridge] close error:', error);
  }
}
