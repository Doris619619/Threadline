/**
 * @fileoverview 为 Electron Renderer 暴露按窗口角色区分的窄 IPC 接口，不泄漏通用 ipcRenderer。
 */

import { contextBridge, ipcRenderer } from 'electron';

const EDGE_ROLE_ARGUMENT = '--threadline-role=edge-tab';
const role = process.argv.includes(EDGE_ROLE_ARGUMENT) ? 'edge-tab' : 'main';

/** 订阅受限 Main 事件并返回只移除此监听器的清理函数。 */
function subscribe(
  channel: 'desktop:geometry-changed' | 'desktop:presentation-rollback',
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
      }
    : {
        environment: 'electron' as const,
        role,
        hydrateDesktopState: (payload: unknown) =>
          ipcRenderer.invoke('desktop:hydrate', payload),
        transitionWindow: (payload: unknown) =>
          ipcRenderer.invoke('desktop:transition', payload),
        bringToFront: () => ipcRenderer.invoke('desktop:bring-to-front'),
        onNativeGeometryChanged: (listener: (payload: unknown) => void) =>
          subscribe('desktop:geometry-changed', listener),
        onPresentationRollback: (listener: (payload: unknown) => void) =>
          subscribe('desktop:presentation-rollback', listener),
      };

contextBridge.exposeInMainWorld('threadlineDesktop', bridge);
