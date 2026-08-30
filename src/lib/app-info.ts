/** @fileoverview 从唯一 package manifest 导出可在 Web 与 Electron renderer 使用的应用信息。 */

import packageManifest from '../../package.json';

export const threadlineAppVersion = packageManifest.version;
