/** @fileoverview 桌面视图状态 Provider，隔离主视图、紧凑收起态与原生窗口 geometry。 */

'use client';

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { applyDesktopWindowView, getCurrentWindowState, listenDesktopWindowGeometry, normalizeCompactWindowState, normalizeWindowStates, type CompactPresentation, type CompactViewMode, type DesktopViewMode, type WindowStateConfig } from '@/lib/tauri-window';

type DesktopWindowContextValue = { mode: DesktopViewMode; presentation: CompactPresentation; setMode: (mode: DesktopViewMode) => Promise<void>; collapseCompactView: () => Promise<void>; restoreCompactView: () => Promise<void>; resetWindowStates: () => Promise<void>; isMiniToday: boolean; isWorkstation: boolean; isCompact: boolean; isEdgeCollapsed: boolean; };
const DesktopWindowContext = createContext<DesktopWindowContextValue | null>(null);

/** 读取当前桌面视图状态；必须位于 DesktopWindowProvider 内。 */
export function useDesktopWindow(): DesktopWindowContextValue { const context = useContext(DesktopWindowContext); if (!context) throw new Error('useDesktopWindow 必须在 DesktopWindowProvider 内使用'); return context; }
/** 将旧 v2 floating-icon 安全迁移为 full，防止非法主模式导致空白页。 */
function normalizeViewMode(value: unknown): DesktopViewMode { return value === 'mini-today' || value === 'workstation' || value === 'full' ? value : 'full'; }
/** 仅允许紧凑视图作为 edge tab 恢复来源。 */
function normalizeCompactMode(value: unknown): CompactViewMode { return value === 'workstation' ? 'workstation' : 'mini-today'; }

/** 提供单主窗口三态切换，使用 v3 key 与旧 v2 window-state 完全隔离。 */
export function DesktopWindowProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState, modeHydrated] = usePersistentState<DesktopViewMode>('threadline.desktop-mode.v3', 'full', normalizeViewMode);
  const [presentation, setPresentation, presentationHydrated] = usePersistentState<CompactPresentation>('threadline.desktop-compact-presentation.v3', 'expanded', (value) => value === 'edge-collapsed' ? value : 'expanded');
  const [lastCompactMode, setLastCompactMode, compactHydrated] = usePersistentState<CompactViewMode>('threadline.desktop-last-compact-mode.v3', 'mini-today', normalizeCompactMode);
  const [windowStates, setWindowStates, statesHydrated] = usePersistentState<Partial<Record<DesktopViewMode, WindowStateConfig>>>('threadline.desktop-window-states.v3', {}, normalizeWindowStates);
  const applyingRef = useRef(false); const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** 保存展开中 view 的合法 geometry；edge tab 固定尺寸不污染紧凑视图。 */
  const persistCurrentState = useCallback(async () => { if (applyingRef.current || presentation === 'edge-collapsed') return; const geometry = await getCurrentWindowState(); if (!geometry) return; setWindowStates((current) => ({ ...current, [mode]: mode === 'full' ? geometry : normalizeCompactWindowState(mode, geometry) })); }, [mode, presentation, setWindowStates]);
  /** 同一个 Tauri 主窗口即时变形成目标 view。 */
  const setMode = useCallback(async (next: DesktopViewMode) => { if (next === mode && presentation === 'expanded') return; await persistCurrentState(); applyingRef.current = true; if (next !== 'full') setLastCompactMode(next); setPresentation('expanded'); setModeState(next); try { await applyDesktopWindowView(next, 'expanded', windowStates); } finally { window.setTimeout(() => { applyingRef.current = false; }, 260); } }, [mode, persistCurrentState, presentation, setLastCompactMode, setModeState, setPresentation, windowStates]);
  /** 将当前紧凑 view 收起为右侧 edge tab，不改变业务 view mode。 */
  const collapseCompactView = useCallback(async () => { if (mode === 'full') return; await persistCurrentState(); applyingRef.current = true; setLastCompactMode(mode); setPresentation('edge-collapsed'); try { await applyDesktopWindowView(mode, 'edge-collapsed', windowStates); } finally { window.setTimeout(() => { applyingRef.current = false; }, 220); } }, [mode, persistCurrentState, setLastCompactMode, setPresentation, windowStates]);
  /** 从 edge tab 悬停恢复其最近紧凑 view。 */
  const restoreCompactView = useCallback(async () => { applyingRef.current = true; setModeState(lastCompactMode); setPresentation('expanded'); try { await applyDesktopWindowView(lastCompactMode, 'expanded', windowStates); } finally { window.setTimeout(() => { applyingRef.current = false; }, 260); } }, [lastCompactMode, setModeState, setPresentation, windowStates]);
  /** 清空 v3 geometry 并对当前形态重新应用默认安全规格。 */
  const resetWindowStates = useCallback(async () => { setWindowStates({}); await applyDesktopWindowView(mode, presentation, {}); }, [mode, presentation, setWindowStates]);
  useEffect(() => { if (modeHydrated && presentationHydrated && compactHydrated && statesHydrated) void applyDesktopWindowView(mode, presentation, windowStates); }, [compactHydrated, mode, modeHydrated, presentation, presentationHydrated, statesHydrated, windowStates]);
  useEffect(() => { let unlisten: () => void = () => undefined; void listenDesktopWindowGeometry(() => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); saveTimerRef.current = setTimeout(() => void persistCurrentState(), 180); }).then((cleanup) => { unlisten = cleanup; }); return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); unlisten(); }; }, [persistCurrentState]);
  return <DesktopWindowContext.Provider value={{ mode, presentation, setMode, collapseCompactView, restoreCompactView, resetWindowStates, isMiniToday: mode === 'mini-today', isWorkstation: mode === 'workstation', isCompact: mode !== 'full', isEdgeCollapsed: presentation === 'edge-collapsed' }}>{children}</DesktopWindowContext.Provider>;
}
