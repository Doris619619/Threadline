/**
 * @fileoverview 定义 Renderer 可调用的窄 Electron bridge 及其无 bridge Web 回退读取方式。
 */

import type {
  CompactPresentation,
  CompactViewMode,
  DesktopViewMode,
  WindowStateConfig,
} from '@/lib/desktop-window-policy';

export type DesktopWindowStates = Partial<Record<DesktopViewMode, WindowStateConfig>>;

export type DesktopHydrationPayload = {
  requestId: number;
  mode: DesktopViewMode;
  presentation: CompactPresentation;
  lastCompactMode: CompactViewMode;
  windowStates: DesktopWindowStates;
};

export type DesktopTransitionCommand = DesktopHydrationPayload;

/** Main 裁决的桌面状态不携带 Renderer requestId，避免命令关联与权威状态版本混用。 */
export type CanonicalDesktopState = Omit<DesktopHydrationPayload, 'requestId'>;

export type NativeApplyResult = {
  requestId: number;
  stateRevision: number;
  mode: DesktopViewMode;
  presentation: CompactPresentation;
  geometry: WindowStateConfig;
  visibleSurface: 'main' | 'edge';
  fallback: boolean;
  reason?: string;
};

/** Main 主动广播的完整桌面状态；Renderer 按 stateRevision 单调应用。 */
export type NativeDesktopStateChanged = CanonicalDesktopState & {
  stateRevision: number;
  geometry: WindowStateConfig;
  visibleSurface: 'main' | 'edge';
  origin: 'renderer-command' | 'edge-restore' | 'second-instance' | 'recovery';
  reason?: string;
};

export type NativeGeometryChanged = {
  geometry: WindowStateConfig;
  mode: DesktopViewMode;
  origin: 'user';
  nativeRevision: number;
};

export type PresentationRollback = {
  mode: DesktopViewMode;
  reason: string;
};

type Unsubscribe = () => void;

export type ThreadlineDesktopBridge =
  | {
      environment: 'electron';
      role: 'main';
      hydrateDesktopState: (
        payload: DesktopHydrationPayload,
      ) => Promise<NativeApplyResult>;
      transitionWindow: (
        command: DesktopTransitionCommand,
      ) => Promise<NativeApplyResult>;
      bringToFront: () => Promise<NativeApplyResult>;
      minimizeMainWindow: () => Promise<void>;
      closeMainWindow: () => Promise<void>;
      acknowledgeNativeState: (stateRevision: number) => Promise<void>;
      onNativeStateChanged: (
        listener: (event: NativeDesktopStateChanged) => void,
      ) => Unsubscribe;
      onNativeGeometryChanged: (
        listener: (event: NativeGeometryChanged) => void,
      ) => Unsubscribe;
      onPresentationRollback: (
        listener: (event: PresentationRollback) => void,
      ) => Unsubscribe;
    }
  | {
      environment: 'electron';
      role: 'edge-tab';
      restoreMain: () => Promise<NativeApplyResult>;
    };

declare global {
  interface Window {
    threadlineDesktop?: ThreadlineDesktopBridge;
  }
}

/** 同步读取预加载 bridge；普通 Web/PWA 永远返回 undefined。 */
export function getThreadlineDesktopBridge(): ThreadlineDesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.threadlineDesktop;
}

/** 判断当前 Renderer 是否为 Electron 的主业务窗口。 */
export function getMainDesktopBridge():
  Extract<ThreadlineDesktopBridge, { role: 'main' }> | undefined {
  const bridge = getThreadlineDesktopBridge();
  return bridge?.role === 'main' ? bridge : undefined;
}
