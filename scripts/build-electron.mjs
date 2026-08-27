/**
 * @fileoverview 对 Electron Main 与 Preload 先做类型检查，再生成统一的 CommonJS bundle。
 */

import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

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

typecheckElectron();
await rm('dist-electron', { force: true, recursive: true });
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
