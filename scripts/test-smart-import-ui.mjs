/** @fileoverview 用独占回环开发服务执行智能导入浏览器回归，固定本地适配器并在结束时关闭自己启动的进程。 */
import { spawn, spawnSync } from 'node:child_process';
import {
  assertTestServerPortAvailable,
  resolveTestServerPort,
} from './test-server-port.mjs';

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('test-smart-import-ui must be started through pnpm.');
const port = resolveTestServerPort('THREADLINE_SMART_IMPORT_PORT', 32221);
const origin = `http://127.0.0.1:${port}`;
const environment = {
  ...process.env,
  NODE_ENV: 'development',
  NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: 'true',
  VERCEL_ENV: 'development',
  ELECTRON_BUILD: '',
  THREADLINE_TOGETHER_PREVIEW: '',
  THREADLINE_SMART_IMPORT_PORT: String(port),
  THREADLINE_EXTERNAL_TEST_SERVER: 'true',
};

/** 只等待本次服务就绪；已有端口由实际绑定检查拒绝，不接受另一服务的成功响应。 */
async function waitForServer(server) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`Next import test server exited with ${server.exitCode}.`);
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      // 当前进程尚未监听时继续有界轮询。
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Next import test server did not become ready: ${origin}`);
}

/** Windows 关闭所启动的 CLI 及其 dev worker；其它平台由 CLI 的 SIGTERM 清理子进程。 */
function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  else server.kill('SIGTERM');
}

let server;
/** 控制台中断只清理本次启动的服务，不查找或终止其它 worktree 的进程。 */
function interrupt() {
  stopServer(server);
  process.exit(130);
}
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);

try {
  await assertTestServerPortAvailable(port);
  server = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { env: environment, stdio: 'inherit', windowsHide: true },
  );
  await waitForServer(server);
  const argumentsList = process.argv.slice(2).filter((value) => value !== '--');
  const result = spawnSync(
    process.execPath,
    [
      pnpmCli,
      'exec',
      'playwright',
      'test',
      '--config',
      'playwright.smart-import.config.ts',
      ...argumentsList,
    ],
    { env: environment, stdio: 'inherit', windowsHide: true },
  );
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  stopServer(server);
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
