/** @fileoverview 构建无 Supabase 的 Vercel Preview 演示并运行独立浏览器验收，不启动数据库。 */
import { spawn, spawnSync } from 'node:child_process';

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('test-preview must be started through pnpm.');
const environment = {
  ...process.env,
  VERCEL_ENV: 'preview',
  ELECTRON_BUILD: '',
  NEXT_PUBLIC_SUPABASE_URL: '',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
  NEXT_PUBLIC_THREADLINE_CLOUD_ENV: '',
  NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: '',
  THREADLINE_PREVIEW_URL: 'http://127.0.0.1:3103',
};

/** 顺序执行构建和测试，任一步失败保留原退出码。 */
function runPnpm(args) {
  const result = spawnSync(process.execPath, [pnpmCli, ...args], {
    env: environment,
    stdio: 'inherit',
  });
  if (result.status !== 0)
    throw Object.assign(new Error(`pnpm ${args.join(' ')} failed`), {
      exitCode: result.status ?? 1,
    });
}

/** 只等待本任务服务就绪，提前退出或超时均直接报错。 */
async function waitForServer(server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`Preview server exited with ${server.exitCode}`);
    try {
      if ((await fetch(environment.THREADLINE_PREVIEW_URL)).ok) return;
    } catch {
      /* 尚未监听。 */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Preview server did not become ready.');
}

let server;
try {
  runPnpm(['build:web']);
  server = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3103',
    ],
    { env: environment, stdio: 'inherit' },
  );
  await waitForServer(server);
  runPnpm([
    'exec',
    'playwright',
    'test',
    '--config',
    'playwright.preview.config.ts',
    ...process.argv.slice(2).filter((arg) => arg !== '--'),
  ]);
} catch (error) {
  console.error(error);
  process.exitCode = error.exitCode ?? 1;
} finally {
  server?.kill();
}
