/**
 * @fileoverview 以显式 local adapter 验证 Electron 静态 Renderer、Main/Preload 与窗口 smoke。
 */

import { spawnSync } from 'node:child_process';

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('test-electron-suite must be started through pnpm.');
const environment = {
  ...process.env,
  NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: 'true',
};

/** 执行 pnpm 阶段；任何阶段失败都会阻止后续 smoke 被误报通过。 */
function runPnpm(argumentsList) {
  const result = spawnSync(process.execPath, [pnpmCli, ...argumentsList], {
    env: environment,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** 运行已有 Node smoke 并继承 test adapter 构建环境。 */
function runNode(script) {
  const result = spawnSync(process.execPath, [script], {
    env: environment,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runPnpm(['desktop:compile']);
runPnpm(['desktop:renderer']);
runPnpm(['build:web']);
runNode('scripts/test-electron.mjs');
