/**
 * @fileoverview 桌面窗口状态 Provider，保存三态几何信息、悬浮前形态并同步 Tauri 原生窗口。
 */

'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePersistentState } from '@/hooks/use-persistent-state';
import {
  applyDesktopWindowMode,
  DEFAULT_WINDOW_CONFIGS,
  getCurrentWindowState,
  listenDesktopWindowGeometry,
  setFloatingContextMenuOpen,
  type DesktopWindowMode,
  type WindowStateConfig,
} from '@/lib/tauri-window';

type DesktopWindowContextValue = {
  mode: DesktopWindowMode;
  setMode: (mode: DesktopWindowMode) => Promise<void>;
  restoreFromFloating: () => Promise<void>;
  setFloatingSize: (size: number) => Promise<void>;
  floatingContextOpen: boolean;
  setFloatingContextOpen: (open: boolean) => Promise<void>;
  resetWindowStates: () => Promise<void>;
  isMiniToday: boolean;
  isFloatingIcon: boolean;
  isFull: boolean;
};

const DesktopWindowContext = createContext<DesktopWindowContextValue | null>(null);

/** 读取当前桌面窗口状态；必须在 DesktopWindowProvider 内使用。 */
export function useDesktopWindow(): DesktopWindowContextValue {
  const context = useContext(DesktopWindowContext);
  if (!context) throw new Error('useDesktopWindow 必须在 DesktopWindowProvider 内使用');
  return context;
}

/**
 * 提供三态窗口状态，并将每种形态的尺寸位置分别持久化到本地配置。
 */
export function DesktopWindowProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = usePersistentState<DesktopWindowMode>(
    'threadline.desktop-mode.v2',
    'full',
  );
  const [windowStates, setWindowStates] = usePersistentState<
    Partial<Record<DesktopWindowMode, WindowStateConfig>>
  >('threadline.desktop-window-states.v2', {});
  const [modeBeforeFloating, setModeBeforeFloating] = usePersistentState<DesktopWindowMode>(
    'threadline.desktop-mode-before-floating.v2',
    'full',
  );
  const mountedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ignoreFloatingMenuGeometryRef = useRef(false);
  const [floatingContextOpen, setFloatingContextOpenState] = useState(false);

  /** 保存当前窗口的尺寸与位置；悬浮态也保存图标位置和尺寸。 */
  const persistCurrentState = useCallback(async () => {
    if (ignoreFloatingMenuGeometryRef.current) return;
    const geometry = await getCurrentWindowState();
    if (!geometry) return;
    setWindowStates((current) => ({ ...current, [mode]: geometry }));
  }, [mode, setWindowStates]);

  /** 先写入旧形态，再将 Tauri 窗口切换到目标形态。 */
  const setMode = useCallback(
    async (next: DesktopWindowMode) => {
      if (next === mode) return;
      await persistCurrentState();
      if (next === 'floating-icon' && mode !== 'floating-icon') {
        setModeBeforeFloating(mode);
      }
      if (next !== 'floating-icon') {
        ignoreFloatingMenuGeometryRef.current = false;
        setFloatingContextOpenState(false);
      }
      setModeState(next);
      await applyDesktopWindowMode(next, windowStates);
    },
    [mode, persistCurrentState, setModeBeforeFloating, setModeState, windowStates],
  );

  /** 从悬浮图标恢复用户上次使用的完整或迷你形态。 */
  const restoreFromFloating = useCallback(async () => {
    await setMode(modeBeforeFloating === 'floating-icon' ? 'full' : modeBeforeFloating);
  }, [modeBeforeFloating, setMode]);

  /** 设置悬浮图标的正方形尺寸，并立即按新的尺寸重新应用悬浮窗口。 */
  const setFloatingSize = useCallback(
    async (size: number) => {
      const next = Math.max(56, Math.min(88, size));
      const current = windowStates['floating-icon'] ?? DEFAULT_WINDOW_CONFIGS['floating-icon'];
      const nextStates = {
        ...windowStates,
        'floating-icon': { ...current, width: next, height: next },
      };
      setWindowStates(nextStates);
      if (mode === 'floating-icon') {
        ignoreFloatingMenuGeometryRef.current = false;
        setFloatingContextOpenState(false);
        await applyDesktopWindowMode('floating-icon', nextStates);
      }
    },
    [mode, setWindowStates, windowStates],
  );

  /** 在悬浮图标与右键菜单需要的临时窗口规格之间切换，不写入图标尺寸记录。 */
  const setFloatingContextOpen = useCallback(
    async (open: boolean) => {
      if (mode !== 'floating-icon') return;
      ignoreFloatingMenuGeometryRef.current = open;
      setFloatingContextOpenState(open);
      await setFloatingContextMenuOpen(open, windowStates['floating-icon']);
    },
    [mode, windowStates],
  );

  /** 重置三种形态的位置和尺寸，并将当前形态恢复为其默认窗口规格。 */
  const resetWindowStates = useCallback(async () => {
    setWindowStates({});
    await applyDesktopWindowMode(mode, {});
  }, [mode, setWindowStates]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void applyDesktopWindowMode(mode, windowStates);
  }, [mode, windowStates]);

  useEffect(() => {
    let unlisten: () => void = () => {};
    void listenDesktopWindowGeometry(() => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => void persistCurrentState(), 180);
    }).then((cleanup) => {
      unlisten = cleanup;
    });
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      unlisten();
    };
  }, [persistCurrentState]);

  const value: DesktopWindowContextValue = {
    mode,
    setMode,
    restoreFromFloating,
    setFloatingSize,
    floatingContextOpen,
    setFloatingContextOpen,
    resetWindowStates,
    isMiniToday: mode === 'mini-today',
    isFloatingIcon: mode === 'floating-icon',
    isFull: mode === 'full',
  };

  return <DesktopWindowContext.Provider value={value}>{children}</DesktopWindowContext.Provider>;
}
