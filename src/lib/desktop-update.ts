/** @fileoverview Main 与 Renderer 共用的自动更新状态和窄接口类型。 */
export type DesktopUpdateState = {
  revision: number;
  status:
    | 'unavailable'
    | 'idle'
    | 'checking'
    | 'available'
    | 'current'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error';
  currentVersion: string;
  version?: string;
  percent?: number;
  message?: string;
};

export type DesktopUpdateBridge = {
  getUpdateState: () => Promise<DesktopUpdateState>;
  checkForUpdate: () => Promise<DesktopUpdateState>;
  downloadUpdate: () => Promise<DesktopUpdateState>;
  installUpdate: () => Promise<DesktopUpdateState>;
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
};
