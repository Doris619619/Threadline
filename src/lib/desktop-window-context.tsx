/**
 * @fileoverview 桌面窗口形态 Context，管理 Full / Mini Today / Floating Icon 三种模式及尺寸位置持久化。
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { usePersistentState } from '@/hooks/use-persistent-state';
import {
  applyDesktopWindowMode,
  getCurrentWindowState,
  type DesktopWindowMode,
  type WindowStateConfig,
} from '@/lib/tauri-window';

type DesktopWindowContextValue = {
  mode: DesktopWindowMode;
  setMode: (mode: DesktopWindowMode) => Promise<void>;
  restoreFromFloating: () => Promise<void>;
  isMiniToday: boolean;
  isFloatingIcon: boolean;
  isFull: boolean;
};

const DesktopWindowContext = createContext<DesktopWindowContextValue | null>(null);

/**
 * 读取当前桌面窗口形态；必须在 DesktopWindowProvider 内使用。
 */
export function useDesktopWindow(): DesktopWindowContextValue {
  const ctx = useContext(DesktopWindowContext);
  if (!ctx) {
    throw new Error('useDesktopWindow 必须在 DesktopWindowProvider 内使用');
  }
  return ctx;
}

/**
 * 提供桌面窗口形态状态，并在 Tauri 环境下同步窗口尺寸与位置。
 */
export function DesktopWindowProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = usePersistentState<DesktopWindowMode>(
    'threadline.desktop-mode.v1',
    'full',
  );
  const [windowStates, setWindowStates] = usePersistentState<
    Partial<Record<DesktopWindowMode, WindowStateConfig>>
  >('threadline.desktop-window-states.v1', {});
  const modeBeforeFloatingRef = useRef<DesktopWindowMode>('mini-today');
  const hydratedRef = useRef(false);

  /** 将当前窗口尺寸位置写入对应模式的持久化记录。 */
  const persistCurrentState = useCallback(async () => {
    const current = await getCurrentWindowState();
    if (current) {
      setWindowStates((prev) => ({ ...prev, [mode]: current }));
    }
  }, [mode, setWindowStates]);

  /** 切换窗口形态：先保存当前形态状态，再应用目标形态。 */
  const setMode = useCallback(
    async (next: DesktopWindowMode) => {
      if (next === mode) return;
      await persistCurrentState();
      if (next === 'floating-icon') {
        modeBeforeFloatingRef.current =
          mode === 'floating-icon' ? 'mini-today' : mode;
      }
      setModeState(next);
      await applyDesktopWindowMode(next, windowStates);
    },
    [mode, persistCurrentState, setModeState, windowStates],
  );

  /** 从悬浮图标恢复切换前的窗口形态。 */
  const restoreFromFloating = useCallback(async () => {
    await setMode(modeBeforeFloatingRef.current);
  }, [setMode]);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void applyDesktopWindowMode(mode, windowStates);
  }, [mode, windowStates]);

  const value: DesktopWindowContextValue = {
    mode,
    setMode,
    restoreFromFloating,
    isMiniToday: mode === 'mini-today',
    isFloatingIcon: mode === 'floating-icon',
    isFull: mode === 'full',
  };

  return (
    <DesktopWindowContext.Provider value={value}>{children}</DesktopWindowContext.Provider>
  );
}
