/**
 * @fileoverview 构建真实本地 Supabase Web 运行时，创建一次性账户并编排浏览器集成测试及清理。
 */

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

import { createClient } from '@supabase/supabase-js';

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('test-supabase-browser must be started through pnpm.');

const port = process.env.THREADLINE_SUPABASE_E2E_PORT ?? '3101';
const origin = `http://127.0.0.1:${port}`;
const playwrightArguments = process.argv.slice(2).filter((value) => value !== '--');

/** 在状态不满足本地测试隔离要求时中止，并保留稳定的诊断文本。 */
function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** 读取项目内 Supabase CLI 的本地状态，且不向控制台输出其中的 secret。 */
function readLocalSupabaseStatus() {
  const command =
    process.platform === 'win32'
      ? 'node_modules\\.bin\\supabase.cmd'
      : 'node_modules/.bin/supabase';
  const result = spawnSync(
    command,
    [
      'status',
      '-o',
      'json',
      ...(process.env.THREADLINE_SUPABASE_WORKDIR
        ? ['--workdir', process.env.THREADLINE_SUPABASE_WORKDIR]
        : []),
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );
  if (result.status !== 0)
    throw new Error(`Supabase status failed: ${result.stderr || result.stdout}`);
  const jsonStart = result.stdout.indexOf('{');
  check(jsonStart >= 0, 'Supabase status did not return JSON.');
  return JSON.parse(result.stdout.slice(jsonStart));
}

/** 拒绝非 loopback API 地址，防止测试账户或浏览器误连远端 Supabase。 */
function assertLocalApiUrl(value) {
  const parsed = new URL(value);
  check(
    parsed.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname),
    'Supabase browser integration only permits a local loopback HTTP API URL.',
  );
}

/** 通过 CLI status 中仅供 runner 使用的 secret 创建已确认的一次性 Email/password 账号。 */
async function createTemporaryAccount(status) {
  check(status.SECRET_KEY, 'Local Supabase status did not include SECRET_KEY.');
  check(
    status.PUBLISHABLE_KEY,
    'Local Supabase status did not include PUBLISHABLE_KEY.',
  );
  assertLocalApiUrl(status.API_URL);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `threadline-browser-${suffix}@example.test`;
  const password = `Threadline-${suffix}-Aa1!`;
  const admin = createClient(status.API_URL, status.SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  check(created.data.user, 'Local Supabase did not create the browser test account.');
  return { admin, email, password, userId: created.data.user.id };
}

/** 运行 pnpm 子阶段并把失败保留为调用方可处理的异常。 */
function runPnpm(argumentsList, environment) {
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

/** 等待 Next production server 监听 loopback URL，启动失败时及早返回其退出原因。 */
async function waitForServer(server) {
  let spawnError;
  server.once('error', (error) => {
    spawnError = error;
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null)
      throw new Error(`Supabase browser test server exited with ${server.exitCode}`);
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      // Next 尚未监听时继续短轮询。
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Supabase browser test server did not become ready: ${origin}`);
}

/** 等待子进程退出并在超时后返回 false，供调用方决定是否升级终止信号。 */
async function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null) return true;
  return Promise.race([
    once(child, 'exit').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

/** 终止 runner 启动的 Next 进程树，避免失败路径在 Windows CI 遗留监听端口的子进程。 */
async function stopServer(server) {
  if (!server?.pid || server.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', `${server.pid}`, '/t', '/f'], { stdio: 'ignore' });
    await waitForProcessExit(server, 5_000);
    return;
  }
  server.kill('SIGTERM');
  if (!(await waitForProcessExit(server, 5_000))) {
    server.kill('SIGKILL');
    await waitForProcessExit(server, 5_000);
  }
}

const status = readLocalSupabaseStatus();
let temporaryAccount;
let server;
let exitCode = 0;

try {
  temporaryAccount = await createTemporaryAccount(status);
  const buildEnvironment = {
    ...process.env,
    VERCEL_ENV: '',
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    NEXT_PUBLIC_THREADLINE_CLOUD_ENV: 'test',
    // 明确覆盖本机 .env.local，保证 CloudRuntimeProvider 而不是 local adapter 接管。
    NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: 'false',
  };
  runPnpm(['build:web'], buildEnvironment);
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--port', port],
    { env: buildEnvironment, stdio: 'inherit' },
  );
  await waitForServer(server);
  const playwrightEnvironment = {
    ...buildEnvironment,
    THREADLINE_SUPABASE_E2E_EMAIL: temporaryAccount.email,
    THREADLINE_SUPABASE_E2E_PASSWORD: temporaryAccount.password,
  };
  runPnpm(
    [
      'exec',
      'playwright',
      'test',
      '--config',
      'playwright.supabase.config.ts',
      ...playwrightArguments,
    ],
    playwrightEnvironment,
  );
  console.log('Local Supabase browser integration passed.');
} catch (error) {
  exitCode = error.exitCode ?? 1;
  console.error(error);
} finally {
  await stopServer(server);
  if (temporaryAccount) {
    await temporaryAccount.admin.auth.admin
      .deleteUser(temporaryAccount.userId)
      .catch((error) => {
        exitCode = 1;
        console.error('Failed to clean up local Supabase browser test account.', error);
      });
    temporaryAccount.admin.realtime.disconnect();
  }
}

process.exit(exitCode);
