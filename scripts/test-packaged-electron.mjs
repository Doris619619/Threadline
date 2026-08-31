/**
 * @fileoverview 对已生成的 Windows unpacked EXE 运行现有 Electron 行为 smoke，不启动 Next 开发服务器。
 */

import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { terminateOwnedProcess } from './desktop-build-runtime.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const defaultExecutable = join(
  repositoryRoot,
  'release',
  'win-unpacked',
  'Threadline.exe',
);
const smokeTimeoutMs = 120_000;

/**
 * 解析调用者指定或 canonical package-dir 生成的 EXE，并拒绝目录或缺失产物。
 */
async function resolvePackagedExecutable() {
  const executablePath = resolve(
    process.env.THREADLINE_PACKAGED_EXECUTABLE ?? defaultExecutable,
  );
  const details = await stat(executablePath);
  if (!details.isFile())
    throw new Error(`Packaged Electron executable is not a file: ${executablePath}`);
  return executablePath;
}

/**
 * 运行已有窗口行为测试，并在它异常或卡住时只回收本 runner 创建的 Node/Electron 进程树。
 */
async function runPackagedSmoke(executablePath) {
  const environment = {
    ...process.env,
    THREADLINE_PACKAGED_EXECUTABLE: executablePath,
  };
  // 打包 app 必须完全脱离开发服务器；清掉调用 shell 遗留的 renderer URL。
  delete environment.THREADLINE_ELECTRON_RENDERER_URL;
  const child = spawn(
    process.execPath,
    [join(import.meta.dirname, 'test-electron.mjs')],
    {
      cwd: repositoryRoot,
      env: environment,
      stdio: 'inherit',
      windowsHide: true,
    },
  );

  try {
    const code = await new Promise((resolveExit, rejectExit) => {
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        void terminateOwnedProcess(child).finally(() =>
          rejectExit(
            new Error(
              `Packaged Electron smoke exceeded ${smokeTimeoutMs}ms and was terminated.`,
            ),
          ),
        );
      }, smokeTimeoutMs);
      child.once('error', (error) => {
        if (timedOut) return;
        clearTimeout(timeout);
        rejectExit(error);
      });
      child.once('exit', (exitCode) => {
        if (timedOut) return;
        clearTimeout(timeout);
        resolveExit(exitCode);
      });
    });
    if (code !== 0)
      throw new Error(
        `Packaged Electron smoke failed with exit code ${code ?? 'null'}.`,
      );
  } finally {
    await terminateOwnedProcess(child).catch(() => undefined);
  }
}

try {
  const executablePath = await resolvePackagedExecutable();
  await runPackagedSmoke(executablePath);
  console.log(`Packaged Electron smoke passed: ${executablePath}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
