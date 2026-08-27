/**
 * @fileoverview 仅对 electron-builder 产出的 Windows executable 关闭未使用的 Electron fuse。
 */

import fuses from '@electron/fuses';

const { flipFuses, FuseV1Options, FuseVersion } = fuses;

const executable = process.argv[2];
if (!executable)
  throw new Error('Usage: node scripts/flip-electron-fuses.mjs <Threadline.exe>');

await flipFuses(executable, {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
});
