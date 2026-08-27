/** @fileoverview 在 electron-builder 写入 ASAR integrity 后，对最终 Windows executable 应用并验证 fuses。 */
/* eslint-disable @typescript-eslint/no-require-imports */

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

/** Electron Builder afterPack hook：只处理 Windows x64 产物，不影响 desktop:dev。 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const executable = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`,
  );
  for (const script of ['flip-electron-fuses.mjs', 'verify-electron-fuses.mjs']) {
    const result = spawnSync(
      process.execPath,
      [join(context.packager.projectDir, 'scripts', script), executable],
      {
        stdio: 'inherit',
      },
    );
    if (result.status !== 0)
      throw new Error(`${script} failed with status ${result.status}`);
  }
};
