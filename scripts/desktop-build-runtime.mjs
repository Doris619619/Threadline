/**
 * @fileoverview 提供 Windows 桌面打包的 Git/进程预检、共享锁、受控子进程与卡住诊断能力。
 */

import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFile,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

export const DEFAULT_PACKAGING_STALL_MS = 180_000;

/** 为构建错误附加稳定错误码，便于人和自动化区分并发、运行中应用与卡住。 */
export class DesktopBuildError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DesktopBuildError';
    this.code = code;
    this.details = details;
  }
}

/** 判断 PID 是否仍存在；权限不足视为仍存活，避免错误清理其他进程的锁。 */
export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** 以原子独占文件创建桌面打包锁；仅在锁内所有 PID 均消失后回收 stale lock。 */
export async function acquireDesktopBuildLock({
  lockPath,
  metadata,
  processIsAlive = isProcessAlive,
}) {
  await mkdir(dirname(lockPath), { recursive: true });
  const nonce = randomUUID();
  const lock = {
    schemaVersion: 1,
    nonce,
    pid: process.pid,
    builderPid: null,
    ...metadata,
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`, 'utf8');
      await handle.close();
      return lock;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let existing;
      try {
        existing = JSON.parse(await readFile(lockPath, 'utf8'));
      } catch {
        existing = null;
      }
      const livePids = [existing?.pid, existing?.builderPid].filter((pid) =>
        processIsAlive(pid),
      );
      if (livePids.length > 0 || existing === null) {
        throw new DesktopBuildError(
          'DESKTOP_BUILD_ALREADY_RUNNING',
          'Threadline desktop packaging is already running.',
          { ...existing, livePids },
        );
      }
      await rm(lockPath, { force: true });
    }
  }
  throw new DesktopBuildError(
    'DESKTOP_BUILD_ALREADY_RUNNING',
    'Unable to acquire the Threadline desktop packaging lock.',
  );
}

/** 更新当前持有的锁；nonce 不一致时拒绝覆盖后来构建创建的锁。 */
export async function updateDesktopBuildLock(lockPath, lock, patch) {
  const current = JSON.parse(await readFile(lockPath, 'utf8'));
  if (current.nonce !== lock.nonce) {
    throw new DesktopBuildError(
      'DESKTOP_BUILD_LOCK_LOST',
      'Desktop packaging lock ownership changed unexpectedly.',
    );
  }
  Object.assign(lock, patch);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

/** 仅由仍持有相同 nonce 的构建释放锁，避免删除后续任务的锁。 */
export async function releaseDesktopBuildLock(lockPath, lock) {
  try {
    const current = JSON.parse(await readFile(lockPath, 'utf8'));
    if (current.nonce === lock.nonce) await rm(lockPath, { force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

/** 运行只读 Git 命令并返回标准输出；失败会保留 Git 的原始错误信息。 */
function readGit(argumentsList, repositoryRoot, preserveLeadingWhitespace = false) {
  const result = spawnSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${argumentsList.join(' ')} failed`);
  }
  return preserveLeadingWhitespace ? result.stdout.trimEnd() : result.stdout.trim();
}

/** 解析 porcelain 路径且保留首行状态列前的空格，避免首个文件名丢失首字符。 */
export function parseGitStatusPaths(status) {
  return status ? status.split(/\r?\n/).map((line) => line.slice(3)) : [];
}

/** 读取本轮构建可追溯的 branch、HEAD 与 dirty paths；Preview 允许 dirty 但不会隐瞒。 */
export function collectGitState(repositoryRoot) {
  const status = readGit(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    repositoryRoot,
    true,
  );
  return {
    branch: readGit(['branch', '--show-current'], repositoryRoot) || 'detached',
    commit: readGit(['rev-parse', 'HEAD'], repositoryRoot),
    workingTree: status ? 'dirty' : 'clean',
    dirtyPaths: parseGitStatusPaths(status),
  };
}

/** 查询与 Threadline 打包有关的 Windows 进程；查询失败返回 unavailable，不猜测进程状态。 */
export function inspectWindowsDesktopProcesses() {
  if (process.platform !== 'win32') return { status: 'unavailable', processes: [] };
  const script = [
    "$items = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Threadline.exe' -or $_.CommandLine -like '*electron-builder*' }",
    '$items | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,KernelModeTime,UserModeTime,ReadTransferCount,WriteTransferCount | ConvertTo-Json -Compress',
  ].join('; ');
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (result.status !== 0) return inspectThreadlineProcessesWithoutCim();
  const output = result.stdout.trim();
  if (!output) return inspectThreadlineProcessesWithoutCim();
  try {
    const parsed = JSON.parse(output);
    return {
      status: 'available',
      processes: Array.isArray(parsed) ? parsed : [parsed],
    };
  } catch {
    return inspectThreadlineProcessesWithoutCim();
  }
}

/** 当 Win32_Process 因权限不可读时，回退到 Get-Process，至少可靠阻止覆盖正在运行的目标 EXE。 */
function inspectThreadlineProcessesWithoutCim() {
  const script =
    'Get-Process -Name Threadline -ErrorAction SilentlyContinue | Select-Object Id,Path,ProcessName | ConvertTo-Json -Compress';
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (result.status !== 0) return { status: 'unavailable', processes: [] };
  try {
    const parsed = JSON.parse(result.stdout.trim() || '[]');
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return {
      status: 'available',
      processes: items.map((item) => ({
        ProcessId: item.Id,
        ExecutablePath: item.Path,
        Name: item.ProcessName,
      })),
    };
  } catch {
    return { status: 'unavailable', processes: [] };
  }
}

/** 查询指定 builder PID 的完整子进程树与 CPU/I/O 计数；仅供 PACKAGING_STALL 诊断。 */
export function inspectWindowsProcessTree(rootPid) {
  if (process.platform !== 'win32') return { status: 'unavailable', processes: [] };
  const script = [
    '$items = Get-CimInstance Win32_Process',
    `$pending = @(${Number(rootPid)})`,
    '$selected = @()',
    'while ($pending.Count -gt 0) { $pidValue = $pending[0]; $pending = @($pending | Select-Object -Skip 1); $matches = @($items | Where-Object { $_.ProcessId -eq $pidValue -or $_.ParentProcessId -eq $pidValue }); $selected += $matches; $pending += @($matches | Where-Object { $_.ProcessId -ne $pidValue } | Select-Object -ExpandProperty ProcessId) }',
    '$selected | Sort-Object ProcessId -Unique | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,KernelModeTime,UserModeTime,ReadTransferCount,WriteTransferCount | ConvertTo-Json -Compress',
  ].join('; ');
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (result.status !== 0) return { status: 'unavailable', processes: [] };
  try {
    const parsed = JSON.parse(result.stdout.trim() || '[]');
    return {
      status: 'available',
      processes: Array.isArray(parsed) ? parsed : [parsed],
    };
  } catch {
    return { status: 'unavailable', processes: [] };
  }
}

/** 拒绝覆盖仍在运行的目标 EXE，并识别带当前仓库绝对路径的新式 builder 命令。 */
export function assertNoConflictingDesktopProcess({
  repositoryRoot,
  targetExecutable,
  ignoredPids = [],
  inspection = inspectWindowsDesktopProcesses(),
}) {
  if (inspection.status !== 'available') return inspection;
  const normalizedRoot = resolve(repositoryRoot).toLowerCase();
  const normalizedTarget = resolve(targetExecutable).toLowerCase();
  const ignored = new Set(ignoredPids);
  const targetProcess = inspection.processes.find(
    (item) =>
      !ignored.has(item.ProcessId) &&
      item.ExecutablePath &&
      resolve(item.ExecutablePath).toLowerCase() === normalizedTarget,
  );
  if (targetProcess) {
    throw new DesktopBuildError(
      'DESKTOP_TARGET_RUNNING',
      'The target Threadline.exe is still running.',
      targetProcess,
    );
  }
  const builderProcess = inspection.processes.find((item) => {
    const commandLine = String(item.CommandLine ?? '').toLowerCase();
    return (
      !ignored.has(item.ProcessId) &&
      commandLine.includes('electron-builder') &&
      commandLine.includes(normalizedRoot)
    );
  });
  if (builderProcess) {
    throw new DesktopBuildError(
      'DESKTOP_BUILD_ALREADY_RUNNING',
      'An existing Threadline electron-builder process is still running.',
      builderProcess,
    );
  }
  return inspection;
}

/** 只删除调用方明确列入 allowlist 的绝对路径，防止变量或路径计算错误扩大清理范围。 */
export async function removeAllowedBuildTarget(targetPath, allowedPaths) {
  const normalizedTarget = resolve(targetPath).toLowerCase();
  const allowed = allowedPaths.map((item) => resolve(item).toLowerCase());
  if (!allowed.includes(normalizedTarget)) {
    throw new DesktopBuildError(
      'DESKTOP_BUILD_UNSAFE_OUTPUT',
      `Refusing to remove an unapproved build target: ${targetPath}`,
    );
  }
  await rm(targetPath, { force: true, recursive: true });
}

/** 读取 Defender exclusion；权限不足时只报告 unavailable，不改变安全设置。 */
export function inspectDefenderExclusions(relevantPaths) {
  if (process.platform !== 'win32') {
    return { status: 'unavailable', relevantPaths: [], matchedExclusions: [] };
  }
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference='Stop'; @(Get-MpPreference -ErrorAction Stop).ExclusionPath | ConvertTo-Json -Compress",
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0 || result.stderr.trim()) {
    return { status: 'unavailable', relevantPaths: [], matchedExclusions: [] };
  }
  try {
    const parsed = JSON.parse(result.stdout.trim() || '[]');
    const configuredPaths = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
    const normalized = configuredPaths.map((item) => resolve(item).toLowerCase());
    const matching = relevantPaths.filter((item) => {
      const candidate = resolve(item).toLowerCase();
      return normalized.some(
        (excluded) => candidate === excluded || candidate.startsWith(`${excluded}\\`),
      );
    });
    const matchedExclusions = configuredPaths.filter((item, index) =>
      relevantPaths.some((relevantPath) => {
        const relevant = resolve(relevantPath).toLowerCase();
        const excluded = normalized[index];
        return relevant === excluded || relevant.startsWith(`${excluded}\\`);
      }),
    );
    return {
      status: matching.length > 0 ? 'detected' : 'not-detected',
      relevantPaths: matching,
      matchedExclusions,
    };
  } catch {
    return { status: 'unavailable', relevantPaths: [], matchedExclusions: [] };
  }
}

/** 计算输出树的文件数、总大小与最新时间，作为 builder 是否仍有实质进展的第二信号。 */
export async function snapshotDirectoryTree(rootPath) {
  let files = 0;
  let bytes = 0;
  let latestMtimeMs = 0;
  async function visit(currentPath) {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const child = resolve(currentPath, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) {
        const details = await stat(child);
        files += 1;
        bytes += details.size;
        latestMtimeMs = Math.max(latestMtimeMs, details.mtimeMs);
      }
    }
  }
  await visit(rootPath);
  return { files, bytes, latestMtimeMs };
}

/** 判断 stdout 和输出目录均静默的时间是否超过 stall 阈值，供监控器与单测共享。 */
export function hasPackagingStalled({ now, lastProgressAt, stallMs }) {
  return now - lastProgressAt >= stallMs;
}

/**
 * 终止本轮拥有的子进程：给正常退出一个短暂机会，再精确结束其 Windows 进程树。
 *
 * 该函数只接受调用方刚创建的 ChildProcess，绝不按进程名清理，以免误伤开发机或并发 CI。
 */
export async function terminateOwnedProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill();
  await Promise.race([
    exited,
    // 打包 stall 的失败路径必须迅速释放 CI；长时间 grace period 会掩盖 hang。
    new Promise((resolveDelay) => setTimeout(resolveDelay, 250)),
  ]);
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    child.kill('SIGKILL');
  }
  await Promise.race([
    exited,
    new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000)),
  ]);
}

/**
 * 运行构建子命令并记录耗时；builder 模式同时监控日志和输出目录，静默超时后生成诊断并停止本轮子进程。
 */
export async function runDesktopCommand({
  commandName,
  argumentsList,
  cwd,
  environment = process.env,
  label,
  logPath,
  monitorDirectory,
  stallMs = DEFAULT_PACKAGING_STALL_MS,
  onSpawn,
  onStall,
}) {
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastSnapshot = monitorDirectory
    ? await snapshotDirectoryTree(monitorDirectory)
    : null;
  let stage = label;
  let stalledError = null;
  let handlingStall = false;
  const outputChunks = [];
  if (logPath) {
    await mkdir(dirname(logPath), { recursive: true });
    await writeFile(logPath, '', 'utf8');
  }
  const child = spawn(commandName, argumentsList, {
    cwd,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const childResult = new Promise((resolveResult, rejectResult) => {
    child.once('error', rejectResult);
    child.once('exit', (code, signal) => resolveResult({ code, signal }));
  });
  try {
    await onSpawn?.(child);
  } catch (error) {
    await terminateOwnedProcess(child);
    await childResult.catch(() => undefined);
    throw error;
  }

  /** 转发子进程输出、保存带时间戳的诊断日志，并更新可观察阶段。 */
  const recordOutput = (stream, chunk) => {
    const text = chunk.toString();
    outputChunks.push(text);
    lastProgressAt = Date.now();
    if (/packaging\s+platform=/i.test(text)) stage = 'electron-builder:packaging';
    else if (/building target=/i.test(text)) stage = 'electron-builder:installer';
    else if (/Verified Electron fuses/i.test(text)) stage = 'afterPack:fuses';
    const destination = stream === 'stderr' ? process.stderr : process.stdout;
    destination.write(text);
    if (logPath) {
      void appendFile(
        logPath,
        `[${new Date().toISOString()}] [${stream}] ${text}`,
        'utf8',
      );
    }
  };
  child.stdout.on('data', (chunk) => recordOutput('stdout', chunk));
  child.stderr.on('data', (chunk) => recordOutput('stderr', chunk));

  const monitor = monitorDirectory
    ? setInterval(
        async () => {
          if (handlingStall || child.exitCode !== null) return;
          try {
            const snapshot = await snapshotDirectoryTree(monitorDirectory);
            if (JSON.stringify(snapshot) !== JSON.stringify(lastSnapshot)) {
              lastSnapshot = snapshot;
              lastProgressAt = Date.now();
            }
            if (hasPackagingStalled({ now: Date.now(), lastProgressAt, stallMs })) {
              handlingStall = true;
              const processInspection = inspectWindowsDesktopProcesses();
              const diagnostics = {
                builderPid: child.pid,
                startedAt: new Date(startedAt).toISOString(),
                command: [commandName, ...argumentsList].join(' '),
                stage,
                outputDirectory: monitorDirectory,
                outputSnapshot: snapshot,
                processInspection,
                processTree: inspectWindowsProcessTree(child.pid),
                recentOutput: outputChunks.join('').slice(-4_000),
              };
              stalledError = new DesktopBuildError(
                'PACKAGING_STALL',
                `electron-builder made no observable progress for ${stallMs}ms.`,
                diagnostics,
              );
              await onStall?.(diagnostics);
              await terminateOwnedProcess(child);
            }
          } catch (error) {
            handlingStall = true;
            stalledError = error;
            await terminateOwnedProcess(child);
          }
        },
        Math.min(5_000, Math.max(100, Math.floor(stallMs / 4))),
      )
    : null;
  monitor?.unref();

  const result = await childResult.finally(() => {
    if (monitor) clearInterval(monitor);
  });
  if (stalledError) throw stalledError;
  if (result.code !== 0) {
    throw new DesktopBuildError(
      'DESKTOP_BUILD_COMMAND_FAILED',
      `${label} failed with exit code ${result.code ?? 'null'}.`,
      { signal: result.signal, output: outputChunks.join('').slice(-4_000) },
    );
  }
  return {
    status: 'passed',
    durationMs: Date.now() - startedAt,
    output: outputChunks.join(''),
  };
}

/** 将目标路径转换为相对仓库路径，仅用于清晰的诊断输出。 */
export function displayRepositoryPath(repositoryRoot, targetPath) {
  return relative(repositoryRoot, targetPath) || '.';
}
