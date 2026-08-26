/**
 * @fileoverview 为 Electron Renderer 暴露最小、无 Node 权限的桌面环境标识。
 */

import { contextBridge } from 'electron';

/** 向 Main renderer 暴露 Phase 2 骨架标识；Phase 3 会替换为类型化 role bridge。 */
contextBridge.exposeInMainWorld('threadlineDesktop', {
  environment: 'electron',
  role: 'main',
});
