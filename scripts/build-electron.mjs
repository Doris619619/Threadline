/**
 * @fileoverview 对 Electron Main 与 Preload 先做类型检查，再生成统一的 CommonJS bundle。
 */

import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';

/** 同步执行必须先于 bundle 完成的 Electron 类型检查。 */
function typecheckElectron() {
  const result = spawnSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '-p', 'electron/tsconfig.json'],
    {
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const typecheckStartedAt = performance.now();
typecheckElectron();
console.log(
  `THREADLINE_STAGE electron-typecheck ${Math.round(performance.now() - typecheckStartedAt)}`,
);
await rm('dist-electron', { force: true, recursive: true });
const bundleStartedAt = performance.now();
await build({
  entryPoints: ['electron/main.cts', 'electron/preload.cts'],
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  external: ['electron'],
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  legalComments: 'none',
});
console.log(
  `THREADLINE_STAGE main-preload-bundle ${Math.round(performance.now() - bundleStartedAt)}`,
);
