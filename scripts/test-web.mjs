/** @fileoverview 以显式 local adapter 构建 Web 后运行 Playwright，不允许测试配置进入部署。 */

import { spawn, spawnSync } from 'node:child_process';

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('test-web must be started through pnpm.');
const environment = {
  ...process.env,
  NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: 'true',
};
const playwrightArguments = process.argv.slice(2).filter((value) => value !== '--');
const port = process.env.THREADLINE_E2E_PORT ?? '3100';
const origin = `http://127.0.0.1:${port}`;

/** 继承当前控制台执行 pnpm 子命令，并保留原始退出码。 */
function runPnpm(argumentsList) {
  const result = spawnSync(process.execPath, [pnpmCli, ...argumentsList], {
    env: environment,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    const error = new Error(`pnpm ${argumentsList.join(' ')} failed`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

/** 等待官方 Next production server 监听，避免 Playwright 内部 Windows teardown 挂起。 */
async function waitForServer(server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`Next test server exited with ${server.exitCode}`);
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      // 服务尚未监听时继续短轮询。
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Next test server did not become ready: ${origin}`);
}

let server;
try {
  runPnpm(['build:web']);
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--port', port],
    { env: environment, stdio: 'inherit' },
  );
  server.unref();
  await waitForServer(server);
  environment.THREADLINE_EXTERNAL_TEST_SERVER = 'true';
  runPnpm(['exec', 'playwright', 'test', ...playwrightArguments]);
} catch (error) {
  console.error(error);
  process.exitCode = error.exitCode ?? 1;
} finally {
  server?.kill();
}
