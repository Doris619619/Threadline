/**
 * @fileoverview 为 Electron Renderer 暴露按窗口角色区分的窄 IPC 接口，不泄漏通用 ipcRenderer。
 */

import { contextBridge, ipcRenderer } from 'electron';

const role =
  new URL(window.location.href).searchParams.get('threadline-role') === 'edge-tab'
    ? 'edge-tab'
    : 'main';

/** 订阅受限 Main 事件并返回只移除此监听器的清理函数。 */
function subscribe(
  channel:
    | 'desktop:geometry-changed'
    | 'desktop:maximize-changed'
    | 'desktop:presentation-rollback'
    | 'desktop:state-changed'
    | 'desktop:update-state',
  listener: (payload: unknown) => void,
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
    listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const bridge =
  role === 'edge-tab'
    ? {
        environment: 'electron' as const,
        role,
        restoreMain: () => ipcRenderer.invoke('desktop:restore-main'),
        edgePointer: (phase: 'start' | 'move' | 'end' | 'cancel') =>
          ipcRenderer.invoke('desktop:edge-pointer', phase),
      }
    : {
        environment: 'electron' as const,
        role,
        hydrateDesktopState: (payload: unknown) =>
          ipcRenderer.invoke('desktop:hydrate', payload),
        transitionWindow: (payload: unknown) =>
          ipcRenderer.invoke('desktop:transition', payload),
        bringToFront: () => ipcRenderer.invoke('desktop:bring-to-front'),
        getAutoStartState: () => ipcRenderer.invoke('desktop:auto-start-get'),
        setAutoStartEnabled: (enabled: boolean) =>
          ipcRenderer.invoke('desktop:auto-start-set', enabled),
        deferAutoStart: () => ipcRenderer.invoke('desktop:auto-start-defer'),
        resizeCompactContent: (mode: string, height: number) =>
          ipcRenderer.invoke('desktop:compact-height', mode, height),
        setAppearanceTheme: (theme: string) =>
          ipcRenderer.invoke('desktop:appearance', theme),
        showEntryWindow: () => ipcRenderer.invoke('desktop:entry-window'),
        minimizeMainWindow: () => ipcRenderer.invoke('desktop:minimize-main'),
        closeMainWindow: () => ipcRenderer.invoke('desktop:close-main'),
        getMainWindowMaximized: () => ipcRenderer.invoke('desktop:get-maximized'),
        toggleMainWindowMaximized: () => ipcRenderer.invoke('desktop:toggle-maximized'),
        exportReportPdf: () => ipcRenderer.invoke('desktop:export-report-pdf'),
        openMailto: (url: string) => ipcRenderer.invoke('desktop:open-mailto', url),
        acknowledgeNativeState: (stateRevision: number) =>
          ipcRenderer.invoke('desktop:state-applied', stateRevision),
        onNativeStateChanged: (listener: (payload: unknown) => void) =>
          subscribe('desktop:state-changed', listener),
        onNativeGeometryChanged: (listener: (payload: unknown) => void) =>
          subscribe('desktop:geometry-changed', listener),
        onMainWindowMaximizeChanged: (listener: (payload: unknown) => void) =>
          subscribe('desktop:maximize-changed', listener),
        onPresentationRollback: (listener: (payload: unknown) => void) =>
          subscribe('desktop:presentation-rollback', listener),
        getUpdateState: () => ipcRenderer.invoke('desktop:update-get'),
        checkForUpdate: () => ipcRenderer.invoke('desktop:update-check'),
        downloadUpdate: () => ipcRenderer.invoke('desktop:update-download'),
        installUpdate: () => ipcRenderer.invoke('desktop:update-install'),
        onUpdateState: (listener: (payload: unknown) => void) =>
          subscribe('desktop:update-state', listener),
      };

contextBridge.exposeInMainWorld('threadlineDesktop', bridge);
