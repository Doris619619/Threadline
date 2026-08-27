/**
 * @fileoverview 读取最终 Windows executable 的 fuse wire，并验证 hardening 设置没有在打包后丢失。
 */

import fuses from '@electron/fuses';
import fuseConstants from '@electron/fuses/dist/constants.js';

const { getCurrentFuseWire, FuseV1Options } = fuses;
const { FuseState } = fuseConstants;

const executable = process.argv[2];
if (!executable)
  throw new Error('Usage: node scripts/verify-electron-fuses.mjs <Threadline.exe>');

const expected = {
  [FuseV1Options.RunAsNode]: FuseState.DISABLE,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: FuseState.DISABLE,
  [FuseV1Options.EnableNodeCliInspectArguments]: FuseState.DISABLE,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: FuseState.ENABLE,
  [FuseV1Options.OnlyLoadAppFromAsar]: FuseState.ENABLE,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: FuseState.DISABLE,
};
const actual = await getCurrentFuseWire(executable);
for (const [option, state] of Object.entries(expected)) {
  if (actual[Number(option)] !== state)
    throw new Error(
      `Fuse ${option} mismatch: expected ${state}, received ${actual[Number(option)]}`,
    );
}
console.log(`Verified Electron fuses: ${executable}`);
