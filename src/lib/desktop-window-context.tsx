/** @fileoverview 管理 Renderer 期望的桌面状态；Electron 由 Main 裁决真实原生窗口状态。 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
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
import { getMainDesktopBridge } from '@/lib/desktop-bridge';

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
const DesktopWindowContext = createContext<DesktopWindowContextValue | null>(null);

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
  const requestIdRef = useRef(0);
  const startupAppliedRef = useRef(false);
  const [isDesktopReady, setIsDesktopReady] = useState(
    () => typeof window !== 'undefined' && !getMainDesktopBridge(),
  );
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
      if (!bridge) {
        setModeState(nextMode);
        setPresentation(nextPresentation);
        setLastCompactMode(nextLastCompactMode);
        setWindowStates(nextWindowStates);
        return;
      }
      const requestId = ++requestIdRef.current;
      const result = await bridge.transitionWindow({
        requestId,
        mode: nextMode,
        presentation: nextPresentation,
        lastCompactMode: nextLastCompactMode,
        windowStates: nextWindowStates,
      });
      if (result.requestId !== requestId) return;
      setModeState(result.mode);
      setPresentation(result.presentation);
      setLastCompactMode(
        result.mode === 'workstation' ? 'workstation' : nextLastCompactMode,
      );
      setWindowStates((current) => ({ ...current, [result.mode]: result.geometry }));
    },
    [setLastCompactMode, setModeState, setPresentation, setWindowStates],
  );

  /** 切换业务 view；无 bridge 的浏览器只更新业务状态。 */
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
  /** 收起紧凑 view；Web/PWA 只保存 presentation，不调用任何原生 API。 */
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

  /** 只在首次 hydration 发起一次 Electron 握手；Web/PWA 直接成为 ready。 */
  useEffect(() => {
    if (!hydrated || startupAppliedRef.current) return;
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
        if (result.requestId === requestId) {
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
    hydrated,
    lastCompactMode,
    mode,
    presentation,
    setModeState,
    setPresentation,
    setWindowStates,
    windowStates,
  ]);

  /** 仅保存 Main 标记为用户行为的 canonical geometry，不产生反向 transition。 */
  useEffect(() => {
    const bridge = getMainDesktopBridge();
    if (!bridge) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    return bridge.onNativeGeometryChanged((event) => {
      if (event.origin !== 'user') return;
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
  }, [setWindowStates]);
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
