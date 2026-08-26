/**
 * @fileoverview 编排 Electron Renderer export、Main 编译、本地开发和 Windows 打包命令。
 */

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [command] = process.argv.slice(2);

/** 同步执行桌面构建子命令，并将失败退出码转交给调用脚本。 */
function run(commandName, argumentsList, environment = process.env) {
  const result = spawnSync(commandName, argumentsList, {
    stdio: 'inherit',
    env: environment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** 等待 Next 开发服务器监听指定 URL，超时后终止 Electron 开发启动。 */
async function waitForRenderer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Next 尚未监听时继续轮询，不把网络错误泄漏给 Renderer。
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Electron Renderer did not become ready: ${url}`);
}

/** 构建 Electron 专用静态 Next export，同时保持普通 Web build 的输出目录不变。 */
function buildRenderer() {
  run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    ...process.env,
    ELECTRON_BUILD: 'true',
  });
}

/** 编译 Main/Preload 并让 electron-builder 生成指定 Windows 产物。 */
function packageApplication(argumentsList) {
  buildRenderer();
  run(process.execPath, [
    'node_modules/typescript/bin/tsc',
    '-p',
    'electron/tsconfig.json',
  ]);
  const collectorStore = mkdtempSync(join(tmpdir(), 'threadline-builder-store-'));
  try {
    run(
      process.execPath,
      [
        'node_modules/electron-builder/out/cli/cli.js',
        '--config',
        'electron-builder.config.cjs',
        ...argumentsList,
      ],
      { ...process.env, PNPM_CONFIG_STORE_DIR: collectorStore },
    );
  } finally {
    rmSync(collectorStore, { force: true, recursive: true });
  }
}

/** 启动本地 Next dev server 后运行 Electron；退出 Electron 时一并回收开发服务器。 */
async function runDevelopmentShell() {
  const rendererUrl =
    process.env.THREADLINE_ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:3118';
  const rendererPort = new URL(rendererUrl).port;
  const nextProcess = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--port', rendererPort],
    {
      stdio: 'inherit',
    },
  );
  try {
    await waitForRenderer(rendererUrl);
    const electronProcess = spawn(
      process.execPath,
      [join('node_modules', 'electron', 'cli.js'), '.'],
      {
        stdio: 'inherit',
        env: { ...process.env, THREADLINE_ELECTRON_RENDERER_URL: rendererUrl },
      },
    );
    await once(electronProcess, 'exit');
  } finally {
    nextProcess.kill();
  }
}

if (command === 'renderer') {
  buildRenderer();
} else if (command === 'package-dir') {
  packageApplication(['--win', '--x64', '--dir']);
} else if (command === 'package') {
  packageApplication(['--win', 'nsis', '--x64']);
} else if (command === 'dev') {
  await runDevelopmentShell();
} else {
  throw new Error(
    'Usage: pnpm desktop:renderer | desktop:dev | desktop:build:dir | desktop:electron:build',
  );
}
