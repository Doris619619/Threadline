/** @fileoverview 桌面视图状态 Provider，隔离三态、原生窗口 geometry 与单实例唤醒。 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
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
import { getMainDesktopBridge } from '@/lib/desktop-bridge';

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
  isDesktopReady: boolean;
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
  return value === 'mini-today' || value === 'workstation' || value === 'full'
    ? value
    : 'full';
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
  const [mode, setModeState, modeHydrated] = usePersistentState<DesktopViewMode>(
    'threadline.desktop-mode.v3',
    'full',
    normalizeViewMode,
  );
  const [presentation, setPresentation, presentationHydrated] =
    usePersistentState<CompactPresentation>(
      'threadline.desktop-compact-presentation.v3',
      'expanded',
      (value) => (value === 'edge-collapsed' ? value : 'expanded'),
    );
  const [lastCompactMode, setLastCompactMode, compactHydrated] =
    usePersistentState<CompactViewMode>(
      'threadline.desktop-last-compact-mode.v3',
      'mini-today',
      normalizeCompactMode,
    );
  const [windowStates, setWindowStates, statesHydrated] = usePersistentState<
    Partial<Record<DesktopViewMode, WindowStateConfig>>
  >('threadline.desktop-window-states.v3', {}, normalizeWindowStates);
  const applyingRef = useRef(false);
  const startupAppliedRef = useRef(false);
  const requestIdRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestStateRef = useRef<LatestWindowState>({
    mode,
    presentation,
    lastCompactMode,
    windowStates,
  });
  const hydrated =
    modeHydrated && presentationHydrated && compactHydrated && statesHydrated;
  const [isDesktopReady, setIsDesktopReady] = useState(false);

  useEffect(() => {
    latestStateRef.current = { mode, presentation, lastCompactMode, windowStates };
  }, [lastCompactMode, mode, presentation, windowStates]);

  /**
   * Electron transition 只发送 Renderer 的期望 snapshot；Main 回传 canonical native state。
   * 返回 false 表示当前为 Web/Tauri，由调用方保持既有适配器路径。
   */
  const requestElectronTransition = useCallback(
    async (
      nextMode: DesktopViewMode,
      nextPresentation: CompactPresentation,
      nextLastCompactMode: CompactViewMode,
      nextWindowStates: Partial<Record<DesktopViewMode, WindowStateConfig>>,
    ): Promise<boolean> => {
      const bridge = getMainDesktopBridge();
      if (!bridge) return false;

      const requestId = ++requestIdRef.current;
      const result = await bridge.transitionWindow({
        requestId,
        mode: nextMode,
        presentation: nextPresentation,
        lastCompactMode: nextLastCompactMode,
        windowStates: nextWindowStates,
      });
      if (result.requestId !== requestId) return true;

      setModeState(result.mode);
      setPresentation(result.presentation);
      setLastCompactMode(result.mode === 'full' ? nextLastCompactMode : result.mode);
      setWindowStates((current) => ({
        ...current,
        [result.mode]: result.geometry,
      }));
      return true;
    },
    [setLastCompactMode, setModeState, setPresentation, setWindowStates],
  );

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
  const setMode = useCallback(
    async (next: DesktopViewMode) => {
      if (next === mode && presentation === 'expanded') return;

      const nextLastCompactMode = next === 'full' ? lastCompactMode : next;
      if (
        await requestElectronTransition(
          next,
          'expanded',
          nextLastCompactMode,
          windowStates,
        )
      ) {
        return;
      }

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
    },
    [
      mode,
      lastCompactMode,
      persistCurrentState,
      presentation,
      requestElectronTransition,
      setLastCompactMode,
      setModeState,
      setPresentation,
      windowStates,
    ],
  );

  /** 将当前紧凑 view 收起为右侧 edge tab，不改变业务 view mode。 */
  const collapseCompactView = useCallback(async () => {
    if (mode === 'full') return;

    if (await requestElectronTransition(mode, 'edge-collapsed', mode, windowStates)) {
      return;
    }

    await persistCurrentState();
    applyingRef.current = true;
    setLastCompactMode(mode);
    setPresentation('edge-collapsed');

    try {
      await applyDesktopWindowView(mode, 'edge-collapsed', windowStates);
    } finally {
      releaseApplyingFlag(applyingRef);
    }
  }, [
    mode,
    persistCurrentState,
    requestElectronTransition,
    setLastCompactMode,
    setPresentation,
    windowStates,
  ]);

  /** 从 edge tab 悬停恢复其最近紧凑 view，并重新执行原生可见性校验。 */
  const restoreCompactView = useCallback(async () => {
    if (
      await requestElectronTransition(
        lastCompactMode,
        'expanded',
        lastCompactMode,
        windowStates,
      )
    ) {
      return;
    }

    applyingRef.current = true;
    setModeState(lastCompactMode);
    setPresentation('expanded');

    try {
      await applyDesktopWindowView(lastCompactMode, 'expanded', windowStates);
    } finally {
      releaseApplyingFlag(applyingRef);
    }
  }, [
    lastCompactMode,
    requestElectronTransition,
    setModeState,
    setPresentation,
    windowStates,
  ]);

  /** 清空 v3 geometry 并对当前形态重新应用默认安全规格。 */
  const resetWindowStates = useCallback(async () => {
    if (await requestElectronTransition(mode, presentation, lastCompactMode, {})) {
      return;
    }

    applyingRef.current = true;
    setWindowStates({});

    try {
      await applyDesktopWindowView(mode, presentation, {});
    } finally {
      releaseApplyingFlag(applyingRef);
    }
  }, [lastCompactMode, mode, presentation, requestElectronTransition, setWindowStates]);

  /**
   * 水合完成后只恢复一次窗口；Electron 必须由此 handshake 后才首次 reveal，
   * 后续 geometry 持久化绝不触发原生 apply。
   */
  useEffect(() => {
    if (!hydrated || startupAppliedRef.current) return;

    startupAppliedRef.current = true;
    const bridge = getMainDesktopBridge();
    if (!bridge) {
      void applyDesktopWindowView(mode, presentation, windowStates).finally(() => {
        setIsDesktopReady(true);
      });
      return;
    }

    const requestId = ++requestIdRef.current;
    void bridge
      .hydrateDesktopState({
        requestId,
        mode,
        presentation,
        lastCompactMode,
        windowStates,
      })
      .then((result) => {
        if (result.requestId !== requestId) return;
        setModeState(result.mode);
        setPresentation(result.presentation);
        setWindowStates((current) => ({
          ...current,
          [result.mode]: result.geometry,
        }));
      })
      .catch(() => {
        // Main 的 watchdog 会安全显示 Full；Renderer 保持持久化状态供下一次启动恢复。
      })
      .finally(() => {
        setIsDesktopReady(true);
      });
  }, [
    hydrated,
    lastCompactMode,
    mode,
    presentation,
    setModeState,
    setPresentation,
    setWindowStates,
    windowStates,
  ]);

  /** 仅在用户移动或缩放时写回 geometry，不反向改变窗口。 */
  useEffect(() => {
    const bridge = getMainDesktopBridge();
    if (bridge) {
      let saveTimer: ReturnType<typeof setTimeout> | undefined;
      return bridge.onNativeGeometryChanged((event) => {
        if (event.origin !== 'user') return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          setWindowStates((current) => ({
            ...current,
            [event.mode]:
              event.mode === 'full'
                ? event.geometry
                : normalizeCompactWindowState(event.mode, event.geometry),
          }));
        }, 180);
      });
    }

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
  }, [persistCurrentState, setWindowStates]);

  /** 接收 Edge 故障回退，将 Renderer persisted presentation 同步为 Main 已恢复的 expanded。 */
  useEffect(() => {
    const bridge = getMainDesktopBridge();
    if (!bridge) return;
    return bridge.onPresentationRollback(({ mode: restoredMode }) => {
      setModeState(restoredMode);
      setLastCompactMode(restoredMode === 'workstation' ? 'workstation' : 'mini-today');
      setPresentation('expanded');
    });
  }, [setLastCompactMode, setModeState, setPresentation]);

  /** 第二次启动时由 Rust 唤醒主窗口；edge tab 恢复最近紧凑视图，其余状态保持不变。 */
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen(SECOND_INSTANCE_ACTIVATED_EVENT, () => {
        const current = latestStateRef.current;
        if (current.presentation === 'edge-collapsed') {
          void restoreCompactView();
          return;
        }

        applyingRef.current = true;
        void applyDesktopWindowView(
          current.mode,
          current.presentation,
          current.windowStates,
        ).finally(() => {
          releaseApplyingFlag(applyingRef);
        });
      }).then((cleanup) => {
        unlisten = cleanup;
      }),
    );

    return () => {
      unlisten?.();
    };
  }, [restoreCompactView]);

  return (
    <DesktopWindowContext.Provider
      value={{
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
        isDesktopReady,
      }}
    >
      {children}
    </DesktopWindowContext.Provider>
  );
}
