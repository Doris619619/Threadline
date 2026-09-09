/** @fileoverview 管理 Renderer 期望的桌面状态；Electron 由 Main 裁决真实原生窗口状态。 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useOptionalStartupProgress } from '@/features/startup/startup-progress-context';
import { usePersistentState } from '@/hooks/use-persistent-state';
import {
  normalizeCompactWindowState,
  normalizeStartupWindowStates,
  type CompactPresentation,
  type CompactViewMode,
  type DesktopViewMode,
  type WindowStateConfig,
} from '@/lib/desktop-window-policy';
import { getMainDesktopBridge } from '@/lib/desktop-bridge';
import { resolveDesktopWindowCapability } from '@/lib/desktop-window-capability';

type DesktopWindowContextValue = {
  isNativeDesktop: boolean;
  mode: DesktopViewMode;
  presentation: CompactPresentation;
  setMode: (mode: DesktopViewMode) => Promise<void>;
  collapseCompactView: () => Promise<void>;
  restoreCompactView: () => Promise<void>;
  resetWindowStates: () => Promise<void>;
  minimizeMainWindow: () => Promise<void>;
  closeMainWindow: () => Promise<void>;
  isMainWindowMaximized: boolean;
  toggleMainWindowMaximized: () => Promise<void>;
  isMiniToday: boolean;
  isWorkstation: boolean;
  isCompact: boolean;
  isEdgeCollapsed: boolean;
  isDesktopReady: boolean;
};
const DesktopWindowContext = createContext<DesktopWindowContextValue | null>(null);

/** Electron preload 在当前 renderer 生命周期内不可热插拔，因此不需要实际事件订阅。 */
function subscribeToDesktopBridge() {
  return () => undefined;
}

/** 仅通过 Main Renderer bridge 存在性判定原生桌面能力。 */
function getNativeDesktopSnapshot(): boolean {
  return Boolean(getMainDesktopBridge());
}

/** SSR 和首次 hydration 均先保持 Web/PWA 完整工作台，随后读取客户端 bridge。 */
function getServerDesktopSnapshot(): boolean {
  return false;
}

/** 读取桌面视图状态；必须位于 DesktopWindowProvider 内。 */
export function useDesktopWindow(): DesktopWindowContextValue {
  const context = useContext(DesktopWindowContext);
  if (!context) throw new Error('useDesktopWindow 必须在 DesktopWindowProvider 内使用');
  return context;
}
/** 只接受当前三个业务 view。 */
function normalizeViewMode(value: unknown): DesktopViewMode {
  return value === 'mini-today' || value === 'workstation' || value === 'full'
    ? value
    : 'full';
}
/** Edge 永远从紧凑 view 恢复。 */
function normalizeCompactMode(value: unknown): CompactViewMode {
  return value === 'workstation' ? 'workstation' : 'mini-today';
}

/** 提供 Web/PWA 业务状态和窄 Electron bridge 之间的单向桌面状态同步。 */
export function DesktopWindowProvider({ children }: { children: ReactNode }) {
  const startupProgress = useOptionalStartupProgress();
  const workspaceReady =
    !startupProgress || startupProgress.workspaceData.status === 'completed';
  const isNativeDesktop = useSyncExternalStore(
    subscribeToDesktopBridge,
    getNativeDesktopSnapshot,
    getServerDesktopSnapshot,
  );
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
  >('threadline.desktop-window-states.v3', {}, normalizeStartupWindowStates);
  const requestIdRef = useRef(0);
  const appliedStateRevisionRef = useRef(0);
  const startupAppliedRef = useRef(false);
  const [isDesktopReady, setIsDesktopReady] = useState(
    () => typeof window !== 'undefined' && !getMainDesktopBridge(),
  );
  const [isMainWindowMaximized, setIsMainWindowMaximized] = useState(false);
  const hydrated =
    modeHydrated && presentationHydrated && compactHydrated && statesHydrated;

  /** 发送唯一允许的原生 transition，并持久化 Main 返回的 canonical geometry。 */
  const transition = useCallback(
    async (
      nextMode: DesktopViewMode,
      nextPresentation: CompactPresentation,
      nextLastCompactMode: CompactViewMode,
      nextWindowStates: Partial<Record<DesktopViewMode, WindowStateConfig>>,
    ) => {
      const bridge = getMainDesktopBridge();
      if (!bridge) return;
      const requestId = ++requestIdRef.current;
      const result = await bridge.transitionWindow({
        requestId,
        mode: nextMode,
        presentation: nextPresentation,
        lastCompactMode: nextLastCompactMode,
        windowStates: nextWindowStates,
      });
      if (result.requestId !== requestId || requestId !== requestIdRef.current) return;
      appliedStateRevisionRef.current = Math.max(
        appliedStateRevisionRef.current,
        result.stateRevision,
      );
      setModeState(result.mode);
      setPresentation(result.presentation);
      setLastCompactMode(
        result.mode === 'workstation' ? 'workstation' : nextLastCompactMode,
      );
      setWindowStates((current) => ({ ...current, [result.mode]: result.geometry }));
    },
    [setLastCompactMode, setModeState, setPresentation, setWindowStates],
  );

  /** 切换仅由 Electron Main 支持的业务窗口 view。 */
  const setMode = useCallback(
    async (next: DesktopViewMode) => {
      if (next === mode && presentation === 'expanded') return;
      await transition(
        next,
        'expanded',
        next === 'full' ? lastCompactMode : next,
        windowStates,
      );
    },
    [lastCompactMode, mode, presentation, transition, windowStates],
  );
  /** 收起 Electron 紧凑 view 为受限的原生 Edge 窗口。 */
  const collapseCompactView = useCallback(async () => {
    if (mode !== 'full') await transition(mode, 'edge-collapsed', mode, windowStates);
  }, [mode, transition, windowStates]);
  /** 恢复最近紧凑 view。 */
  const restoreCompactView = useCallback(
    async () => transition(lastCompactMode, 'expanded', lastCompactMode, windowStates),
    [lastCompactMode, transition, windowStates],
  );
  /** 忘记 persisted geometry 并应用默认状态。 */
  const resetWindowStates = useCallback(
    async () => transition(mode, presentation, lastCompactMode, {}),
    [lastCompactMode, mode, presentation, transition],
  );
  /** 请求 Electron Main 关闭受管窗口。 */
  const closeMainWindow = useCallback(async () => {
    const bridge = getMainDesktopBridge();
    if (bridge) await bridge.closeMainWindow();
  }, []);
  /** 请求 Electron Main 最小化受管窗口。 */
  const minimizeMainWindow = useCallback(async () => {
    const bridge = getMainDesktopBridge();
    if (bridge) await bridge.minimizeMainWindow();
  }, []);
  /** 切换 Electron Main 的原生最大化状态。 */
  const toggleMainWindowMaximized = useCallback(async () => {
    const bridge = getMainDesktopBridge();
    if (bridge) setIsMainWindowMaximized(await bridge.toggleMainWindowMaximized());
  }, []);

  /** 只在首次 hydration 发起一次 Electron 握手；Web/PWA 直接成为 ready。 */
  useEffect(() => {
    if (!hydrated || !workspaceReady || startupAppliedRef.current) return;
    startupAppliedRef.current = true;
    const bridge = getMainDesktopBridge();
    if (!bridge) {
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
        if (result.requestId === requestId && requestId === requestIdRef.current) {
          appliedStateRevisionRef.current = Math.max(
            appliedStateRevisionRef.current,
            result.stateRevision,
          );
          setModeState(result.mode);
          setPresentation(result.presentation);
          setWindowStates((current) => ({
            ...current,
            [result.mode]: result.geometry,
          }));
        }
      })
      .finally(() => setIsDesktopReady(true));
  }, [
    workspaceReady,
    hydrated,
    lastCompactMode,
    mode,
    presentation,
    setModeState,
    setPresentation,
    setWindowStates,
    windowStates,
  ]);

  /** 仅接受 Main 单调递增的权威状态；写入完成后回传对应 revision 的 acknowledgement。 */
  useEffect(() => {
    const bridge = getMainDesktopBridge();
    if (!bridge) return;
    return bridge.onNativeStateChanged((event) => {
      if (event.stateRevision <= appliedStateRevisionRef.current) {
        void bridge.acknowledgeNativeState(event.stateRevision);
        return;
      }
      appliedStateRevisionRef.current = event.stateRevision;
      setModeState(event.mode);
      setPresentation(event.presentation);
      setLastCompactMode(
        event.mode === 'workstation' ? 'workstation' : event.lastCompactMode,
      );
      setWindowStates((current) => ({
        ...current,
        ...event.windowStates,
        [event.mode]: event.geometry,
      }));
      void bridge.acknowledgeNativeState(event.stateRevision);
    });
  }, [setLastCompactMode, setModeState, setPresentation, setWindowStates]);

  /** 仅保存 Main 确认的用户移动或内容高度 geometry，不产生反向 transition。 */
  useEffect(() => {
    const bridge = getMainDesktopBridge();
    if (!bridge) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = bridge.onNativeGeometryChanged((event) => {
      if (event.origin !== 'user' && event.origin !== 'content') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () =>
          setWindowStates((current) => ({
            ...current,
            [event.mode]:
              event.mode === 'full'
                ? event.geometry
                : normalizeCompactWindowState(event.mode, event.geometry),
          })),
        180,
      );
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [setWindowStates]);
  /** 订阅原生最大化事件并在首次 hydration 后读取初始状态，避免用 CSS 反推窗口状态。 */
  useEffect(() => {
    const bridge = getMainDesktopBridge();
    if (!bridge) return;
    void bridge.getMainWindowMaximized().then(setIsMainWindowMaximized);
    return bridge.onMainWindowMaximizeChanged(({ isMaximized }) =>
      setIsMainWindowMaximized(isMaximized),
    );
  }, []);
  /** 把 Edge 故障回退持久化为 expanded，保持 Renderer 与 Main 一致。 */
  useEffect(() => {
    const bridge = getMainDesktopBridge();
    if (!bridge) return;
    return bridge.onPresentationRollback(({ mode: restoredMode }) => {
      setModeState(restoredMode);
      setLastCompactMode(restoredMode === 'workstation' ? 'workstation' : 'mini-today');
      setPresentation('expanded');
    });
  }, [setLastCompactMode, setModeState, setPresentation]);

  const { mode: effectiveMode, presentation: effectivePresentation } =
    resolveDesktopWindowCapability(isNativeDesktop, mode, presentation);
  return (
    <DesktopWindowContext.Provider
      value={{
        isNativeDesktop,
        mode: effectiveMode,
        presentation: effectivePresentation,
        setMode,
        collapseCompactView,
        restoreCompactView,
        resetWindowStates,
        minimizeMainWindow,
        closeMainWindow,
        isMainWindowMaximized,
        toggleMainWindowMaximized,
        isMiniToday: effectiveMode === 'mini-today',
        isWorkstation: effectiveMode === 'workstation',
        isCompact: effectiveMode !== 'full',
        isEdgeCollapsed: effectivePresentation === 'edge-collapsed',
        isDesktopReady,
      }}
    >
      {children}
    </DesktopWindowContext.Provider>
  );
}
