/** @fileoverview 桌面视图状态 Provider，隔离三态、原生窗口 geometry 与单实例唤醒。 */

'use client';

import { createContext, useCallback, useContext, useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { usePersistentState } from '@/hooks/use-persistent-state';
import {
  normalizeCompactWindowState,
  normalizeWindowStates,
  type CompactPresentation,
  type CompactViewMode,
  type DesktopViewMode,
  type WindowStateConfig,
} from '@/lib/desktop-window-policy';
import {
  applyDesktopWindowView,
  getCurrentWindowState,
  isTauriEnvironment,
  listenDesktopWindowGeometry,
} from '@/lib/tauri-window';

const SECOND_INSTANCE_ACTIVATED_EVENT = 'threadline://second-instance-activated';

type DesktopWindowContextValue = {
  mode: DesktopViewMode;
  presentation: CompactPresentation;
  setMode: (mode: DesktopViewMode) => Promise<void>;
  collapseCompactView: () => Promise<void>;
  restoreCompactView: () => Promise<void>;
  resetWindowStates: () => Promise<void>;
  isMiniToday: boolean;
  isWorkstation: boolean;
  isCompact: boolean;
  isEdgeCollapsed: boolean;
};

type LatestWindowState = {
  mode: DesktopViewMode;
  presentation: CompactPresentation;
  lastCompactMode: CompactViewMode;
  windowStates: Partial<Record<DesktopViewMode, WindowStateConfig>>;
};

const DesktopWindowContext = createContext<DesktopWindowContextValue | null>(null);

/** 读取当前桌面视图状态；必须位于 DesktopWindowProvider 内。 */
export function useDesktopWindow(): DesktopWindowContextValue {
  const context = useContext(DesktopWindowContext);
  if (!context) throw new Error('useDesktopWindow 必须在 DesktopWindowProvider 内使用');
  return context;
}

/** 将旧 v2 floating-icon 安全迁移为 full，防止非法主模式导致空白页。 */
function normalizeViewMode(value: unknown): DesktopViewMode {
  return value === 'mini-today' || value === 'workstation' || value === 'full' ? value : 'full';
}

/** 仅允许紧凑视图作为 edge tab 恢复来源。 */
function normalizeCompactMode(value: unknown): CompactViewMode {
  return value === 'workstation' ? 'workstation' : 'mini-today';
}

/** 在 Tauri 写入窗口属性后，短暂跳过由该次写入回传的 geometry 事件。 */
function releaseApplyingFlag(applyingRef: MutableRefObject<boolean>): void {
  window.setTimeout(() => {
    applyingRef.current = false;
  }, 260);
}

/** 提供单主窗口三态切换，使用 v3 key 与旧 v2 window-state 完全隔离。 */
export function DesktopWindowProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState, modeHydrated] = usePersistentState<DesktopViewMode>('threadline.desktop-mode.v3', 'full', normalizeViewMode);
  const [presentation, setPresentation, presentationHydrated] = usePersistentState<CompactPresentation>('threadline.desktop-compact-presentation.v3', 'expanded', (value) => value === 'edge-collapsed' ? value : 'expanded');
  const [lastCompactMode, setLastCompactMode, compactHydrated] = usePersistentState<CompactViewMode>('threadline.desktop-last-compact-mode.v3', 'mini-today', normalizeCompactMode);
  const [windowStates, setWindowStates, statesHydrated] = usePersistentState<Partial<Record<DesktopViewMode, WindowStateConfig>>>('threadline.desktop-window-states.v3', {}, normalizeWindowStates);
  const applyingRef = useRef(false);
  const startupAppliedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestStateRef = useRef<LatestWindowState>({ mode, presentation, lastCompactMode, windowStates });
  const hydrated = modeHydrated && presentationHydrated && compactHydrated && statesHydrated;

  useEffect(() => {
    latestStateRef.current = { mode, presentation, lastCompactMode, windowStates };
  }, [lastCompactMode, mode, presentation, windowStates]);

  /** 保存展开中 view 的合法 geometry；edge tab 固定尺寸和最小化哨兵值都不污染紧凑视图。 */
  const persistCurrentState = useCallback(async () => {
    if (applyingRef.current || presentation === 'edge-collapsed') return;

    const geometry = await getCurrentWindowState();
    if (!geometry) return;

    setWindowStates((current) => ({
      ...current,
      [mode]: mode === 'full' ? geometry : normalizeCompactWindowState(mode, geometry),
    }));
  }, [mode, presentation, setWindowStates]);

  /** 同一个 Tauri 主窗口即时变形成目标 view。 */
  const setMode = useCallback(async (next: DesktopViewMode) => {
    if (next === mode && presentation === 'expanded') return;

    await persistCurrentState();
    applyingRef.current = true;
    if (next !== 'full') setLastCompactMode(next);
    setPresentation('expanded');
    setModeState(next);

    try {
      await applyDesktopWindowView(next, 'expanded', windowStates);
    } finally {
      releaseApplyingFlag(applyingRef);
    }
  }, [mode, persistCurrentState, presentation, setLastCompactMode, setModeState, setPresentation, windowStates]);

  /** 将当前紧凑 view 收起为右侧 edge tab，不改变业务 view mode。 */
  const collapseCompactView = useCallback(async () => {
    if (mode === 'full') return;

    await persistCurrentState();
    applyingRef.current = true;
    setLastCompactMode(mode);
    setPresentation('edge-collapsed');

    try {
      await applyDesktopWindowView(mode, 'edge-collapsed', windowStates);
    } finally {
      releaseApplyingFlag(applyingRef);
    }
  }, [mode, persistCurrentState, setLastCompactMode, setPresentation, windowStates]);

  /** 从 edge tab 悬停恢复其最近紧凑 view，并重新执行原生可见性校验。 */
  const restoreCompactView = useCallback(async () => {
    applyingRef.current = true;
    setModeState(lastCompactMode);
    setPresentation('expanded');

    try {
      await applyDesktopWindowView(lastCompactMode, 'expanded', windowStates);
    } finally {
      releaseApplyingFlag(applyingRef);
    }
  }, [lastCompactMode, setModeState, setPresentation, windowStates]);

  /** 清空 v3 geometry 并对当前形态重新应用默认安全规格。 */
  const resetWindowStates = useCallback(async () => {
    applyingRef.current = true;
    setWindowStates({});

    try {
      await applyDesktopWindowView(mode, presentation, {});
    } finally {
      releaseApplyingFlag(applyingRef);
    }
  }, [mode, presentation, setWindowStates]);

  /** 水合完成后只恢复一次窗口；后续 geometry 持久化绝不触发原生 apply。 */
  useEffect(() => {
    if (!hydrated || startupAppliedRef.current) return;

    startupAppliedRef.current = true;
    void applyDesktopWindowView(mode, presentation, windowStates);
  }, [hydrated, mode, presentation, windowStates]);

  /** 仅在用户移动或缩放时写回 geometry，不反向改变窗口。 */
  useEffect(() => {
    let unlisten: () => void = () => undefined;
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

  /** 第二次启动时由 Rust 唤醒主窗口；edge tab 恢复最近紧凑视图，其余状态保持不变。 */
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(({ listen }) => listen(SECOND_INSTANCE_ACTIVATED_EVENT, () => {
      const current = latestStateRef.current;
      if (current.presentation === 'edge-collapsed') {
        void restoreCompactView();
        return;
      }

      applyingRef.current = true;
      void applyDesktopWindowView(current.mode, current.presentation, current.windowStates).finally(() => {
        releaseApplyingFlag(applyingRef);
      });
    }).then((cleanup) => {
      unlisten = cleanup;
    }));

    return () => {
      unlisten?.();
    };
  }, [restoreCompactView]);

  return <DesktopWindowContext.Provider value={{
    mode,
    presentation,
    setMode,
    collapseCompactView,
    restoreCompactView,
    resetWindowStates,
    isMiniToday: mode === 'mini-today',
    isWorkstation: mode === 'workstation',
    isCompact: mode !== 'full',
    isEdgeCollapsed: presentation === 'edge-collapsed',
  }}>{children}</DesktopWindowContext.Provider>;
}
