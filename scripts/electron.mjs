/**
 * @fileoverview 编排 Electron Renderer、Main/Preload、production-equivalent Preview 与 Windows 正式打包。
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  comparePackagedApplications,
  hashFile,
  printBuildSuccess,
  verifyPackagedArtifact,
  writeBuildManifest,
} from './desktop-build-artifact.mjs';
import {
  DEFAULT_PACKAGING_STALL_MS,
  DesktopBuildError,
  acquireDesktopBuildLock,
  assertNoConflictingDesktopProcess,
  collectGitState,
  inspectDefenderExclusions,
  releaseDesktopBuildLock,
  removeAllowedBuildTarget,
  runDesktopCommand,
  updateDesktopBuildLock,
} from './desktop-build-runtime.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const lockPath = join(repositoryRoot, '.tmp', 'desktop-packaging.lock.json');
const builderCli = join(
  repositoryRoot,
  'node_modules',
  'electron-builder',
  'out',
  'cli',
  'cli.js',
);
const builderConfig = join(repositoryRoot, 'electron-builder.config.cjs');
const packageMetadata = JSON.parse(
  await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
);
const [command] = process.argv.slice(2);

const modeDefinitions = {
  preview: {
    buildType: 'preview',
    builderArguments: [
      '--win',
      '--x64',
      '--dir',
      '--publish',
      'never',
      '--config.directories.output=release/preview',
    ],
    outputRoot: join(repositoryRoot, 'release', 'preview'),
    appOutDir: join(repositoryRoot, 'release', 'preview', 'win-unpacked'),
    manifestPath: join(repositoryRoot, 'release', 'preview', 'build-manifest.json'),
    installer: null,
  },
  'package-dir': {
    buildType: 'package-dir',
    builderArguments: ['--win', '--x64', '--dir', '--publish', 'never'],
    outputRoot: join(repositoryRoot, 'release'),
    appOutDir: join(repositoryRoot, 'release', 'win-unpacked'),
    manifestPath: join(
      repositoryRoot,
      'release',
      'build-manifests',
      'package-dir.json',
    ),
    installer: null,
  },
  package: {
    buildType: 'release',
    publish: 'never',
    builderArguments: ['--win', 'nsis', '--x64', '--publish', 'never'],
    outputRoot: join(repositoryRoot, 'release'),
    appOutDir: join(repositoryRoot, 'release', 'win-unpacked'),
    manifestPath: join(repositoryRoot, 'release', 'build-manifests', 'release.json'),
    installer: join(
      repositoryRoot,
      'release',
      `Threadline_${packageMetadata.version}_x64-setup.exe`,
    ),
  },
  release: {
    buildType: 'release',
    publish: 'always',
    builderArguments: ['--win', 'nsis', '--x64', '--publish', 'always'],
    outputRoot: join(repositoryRoot, 'release'),
    appOutDir: join(repositoryRoot, 'release', 'win-unpacked'),
    manifestPath: join(repositoryRoot, 'release', 'build-manifests', 'release.json'),
    installer: join(
      repositoryRoot,
      'release',
      `Threadline_${packageMetadata.version}_x64-setup.exe`,
    ),
  },
};

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

/** 执行一个可计时的生产构建阶段，并保持子进程输出实时可见。 */
async function runBuildStage(label, argumentsList, environment = process.env) {
  return runDesktopCommand({
    commandName: process.execPath,
    argumentsList,
    cwd: repositoryRoot,
    environment,
    label,
  });
}

/** 构建 Electron 专用静态 Next export、production CSP 与 service-worker precache。 */
async function buildRenderer() {
  const renderer = await runBuildStage(
    'renderer',
    ['node_modules/next/dist/bin/next', 'build'],
    { ...process.env, ELECTRON_BUILD: 'true' },
  );
  const csp = await runBuildStage('csp', [
    'scripts/generate-csp.mjs',
    '.next-electron',
  ]);
  const precache = await runBuildStage('precache', [
    'scripts/generate-sw-precache.mjs',
    '.next-electron',
  ]);
  return {
    renderer: { status: renderer.status, durationMs: renderer.durationMs },
    csp: { status: csp.status, durationMs: csp.durationMs },
    precache: { status: precache.status, durationMs: precache.durationMs },
  };
}

/** 从 build-electron 的结构化标记中提取 typecheck 与 esbuild 子阶段耗时。 */
function parseElectronBuildStages(result) {
  const stages = {};
  for (const match of result.output.matchAll(/THREADLINE_STAGE (\S+) (\d+)/g)) {
    stages[match[1]] = { status: 'passed', durationMs: Number(match[2]) };
  }
  return {
    electronMainPreload: {
      status: result.status,
      durationMs: result.durationMs,
    },
    electronTypecheck: stages['electron-typecheck'] ?? 'not-separately-observable',
    mainPreloadBundle: stages['main-preload-bundle'] ?? 'not-separately-observable',
  };
}

/** 生成一次可供一个或两个 builder 复用的 Renderer、Main 与 Preload 输入。 */
async function prepareDesktopBuildInputs() {
  const rendererStages = await buildRenderer();
  const electron = await runBuildStage('electron-main-preload', [
    'scripts/build-electron.mjs',
  ]);
  return { ...rendererStages, ...parseElectronBuildStages(electron) };
}

/** 返回 manifest 所需的工具版本，所有值均来自当前实际执行环境或锁定依赖。 */
function collectBuildVersions() {
  return {
    node: process.version,
    pnpm: packageMetadata.packageManager,
    electron: packageMetadata.devDependencies.electron,
    electronBuilder: packageMetadata.devDependencies['electron-builder'],
  };
}

/** 输出 PACKAGING_STALL 的固定指纹和最小 Defender exclusion 建议，不执行任何安全设置。 */
function printPackagingStallGuidance(mode, diagnostics) {
  const electronRuntime = join(repositoryRoot, 'node_modules', 'electron', 'dist');
  console.error('\nPACKAGING_STALL');
  console.error(JSON.stringify(diagnostics, null, 2));
  console.error('\n优先检查 Windows Defender / 文件系统安全扫描。');
  console.error('可在管理员 PowerShell 中临时执行：');
  console.error(`Add-MpPreference -ExclusionPath "${electronRuntime}"`);
  console.error(`Add-MpPreference -ExclusionPath "${mode.outputRoot}"`);
  console.error('构建完成后恢复：');
  console.error(`Remove-MpPreference -ExclusionPath "${electronRuntime}"`);
  console.error(`Remove-MpPreference -ExclusionPath "${mode.outputRoot}"`);
}

/** 只清理当前模式的已批准目标，并保留其他版本、Preview 或正式安装包。 */
async function cleanModeOutputs(mode) {
  const blockmap = mode.installer ? `${mode.installer}.blockmap` : null;
  const latest = join(repositoryRoot, 'release', 'latest.yml');
  const targets =
    mode.buildType === 'preview'
      ? [mode.outputRoot]
      : [
          mode.appOutDir,
          mode.manifestPath,
          ...(mode.installer ? [mode.installer, blockmap, latest] : []),
        ];
  for (const target of targets) {
    await removeAllowedBuildTarget(target, targets);
  }
}

/** 将 afterPack 输出中的计时标记提取到 manifest；其余 builder 内部阶段不伪造精确时间。 */
function collectBuilderStageTimings(result) {
  const match = result.output.match(/THREADLINE_STAGE after-pack-fuses (\d+)/);
  return {
    packaging: { status: 'passed', durationMs: result.durationMs },
    dependencyCollection: 'not-separately-observable',
    runtimeCopy: 'not-separately-observable',
    asarPackaging: 'not-separately-observable',
    afterPackFuses: match
      ? { status: 'passed', durationMs: Number(match[1]) }
      : 'not-separately-observable',
  };
}

/** 执行一次正式 electron-builder 打包、二次安全验证，并在成功后原子生成 manifest。 */
async function packagePreparedInputs({
  mode,
  lock,
  gitState,
  defender,
  preparedStages,
  pipelineStartedAt,
}) {
  const executablePath = join(mode.appOutDir, 'Threadline.exe');
  assertNoConflictingDesktopProcess({
    repositoryRoot,
    targetExecutable: executablePath,
    ignoredPids: [process.pid],
  });
  await cleanModeOutputs(mode);
  const packageStartedAt = Date.now();
  const collectorStore = await mkdtemp(join(tmpdir(), 'threadline-builder-store-'));
  let builderResult;
  try {
    const configuredStallMs = Number(process.env.THREADLINE_PACKAGING_STALL_MS);
    const stallMs =
      Number.isFinite(configuredStallMs) && configuredStallMs > 0
        ? configuredStallMs
        : DEFAULT_PACKAGING_STALL_MS;
    builderResult = await runDesktopCommand({
      commandName: process.execPath,
      argumentsList: [builderCli, '--config', builderConfig, ...mode.builderArguments],
      cwd: repositoryRoot,
      environment: { ...process.env, PNPM_CONFIG_STORE_DIR: collectorStore },
      label: `electron-builder:${mode.buildType}`,
      logPath: join(repositoryRoot, '.tmp', `desktop-${mode.buildType}.log`),
      monitorDirectory: mode.outputRoot,
      stallMs,
      onSpawn: async (child) => {
        await updateDesktopBuildLock(lockPath, lock, { builderPid: child.pid });
      },
      onStall: async (diagnostics) => {
        printPackagingStallGuidance(mode, diagnostics);
      },
    });
  } finally {
    await updateDesktopBuildLock(lockPath, lock, { builderPid: null }).catch(
      () => undefined,
    );
    await rm(collectorStore, { force: true, recursive: true });
  }

  const fuseVerification = await runBuildStage('fuse-verification', [
    'scripts/verify-electron-fuses.mjs',
    executablePath,
  ]);
  const verified = await verifyPackagedArtifact({
    executablePath,
    buildStartedAt: packageStartedAt,
  });
  const artifacts = [{ kind: 'packaged-executable', ...verified.executable }];
  if (mode.installer) {
    const installerStat = await stat(mode.installer);
    artifacts.push({
      kind: 'nsis-installer',
      path: resolve(mode.installer),
      size: installerStat.size,
      sha256: await hashFile(mode.installer),
      mtime: installerStat.mtime.toISOString(),
    });
  }
  const manifest = {
    schemaVersion: 1,
    product: 'Threadline',
    buildType: mode.buildType,
    publish: mode.publish ?? 'never',
    ...gitState,
    builtAt: new Date().toISOString(),
    durationMs: Date.now() - pipelineStartedAt,
    versions: collectBuildVersions(),
    builderConfig: {
      path: builderConfig,
      sha256: await hashFile(builderConfig),
    },
    stages: {
      ...preparedStages,
      ...collectBuilderStageTimings(builderResult),
      fuseVerification: {
        status: fuseVerification.status,
        durationMs: fuseVerification.durationMs,
      },
    },
    asar: verified.asar,
    fuses: { status: 'verified', wire: verified.fuseWire },
    defenderExclusions: defender,
    artifacts,
  };
  await writeBuildManifest(mode.manifestPath, manifest);
  if (mode.buildType === 'preview') printBuildSuccess(manifest, mode.manifestPath);
  return { manifest, manifestPath: mode.manifestPath, executablePath };
}

/** 在共享打包锁内执行任务，并确保异常、Ctrl+C 或 stall 后都释放当前 nonce。 */
async function withDesktopPackagingLock(mode, callback) {
  const gitState = collectGitState(repositoryRoot);
  const startedAt = Date.now();
  const lock = await acquireDesktopBuildLock({
    lockPath,
    metadata: {
      command: process.argv.join(' '),
      startedAt: new Date(startedAt).toISOString(),
      commit: gitState.commit,
      outputPath: mode.outputRoot,
    },
  });
  const defender = inspectDefenderExclusions([
    repositoryRoot,
    join(repositoryRoot, 'node_modules', 'electron', 'dist'),
    mode.outputRoot,
  ]);
  console.log(`Branch: ${gitState.branch}`);
  console.log(`Commit: ${gitState.commit}`);
  console.log(`Working tree: ${gitState.workingTree.toUpperCase()}`);
  try {
    return await callback({ gitState, defender, lock, startedAt });
  } finally {
    await releaseDesktopBuildLock(lockPath, lock);
  }
}

/** 构建单个 Preview/package-dir/NSIS 模式；日常命令不会复用旧 Renderer 输入。 */
async function runPackagingMode(mode) {
  return withDesktopPackagingLock(mode, async (context) => {
    const preparedStages = await prepareDesktopBuildInputs();
    return packagePreparedInputs({
      mode,
      preparedStages,
      pipelineStartedAt: context.startedAt,
      ...context,
    });
  });
}

/** 对 Preview 和 canonical package-dir 使用同一批输入，并执行不改变 runtime 的静态产物合同比较。 */
async function verifyProductionParity() {
  const previewMode = modeDefinitions.preview;
  const canonicalMode = modeDefinitions['package-dir'];
  return withDesktopPackagingLock(previewMode, async (context) => {
    const preparedStages = await prepareDesktopBuildInputs();
    const preview = await packagePreparedInputs({
      mode: previewMode,
      preparedStages,
      pipelineStartedAt: context.startedAt,
      ...context,
    });
    const canonical = await packagePreparedInputs({
      mode: canonicalMode,
      preparedStages,
      pipelineStartedAt: context.startedAt,
      ...context,
    });
    const comparison = await comparePackagedApplications({
      previewExecutable: preview.executablePath,
      canonicalExecutable: canonical.executablePath,
    });
    const reportPath = join(repositoryRoot, 'release', 'preview', 'parity-report.json');
    await writeBuildManifest(reportPath, {
      schemaVersion: 1,
      status: 'passed',
      commit: context.gitState.commit,
      workingTree: context.gitState.workingTree,
      verifiedAt: new Date().toISOString(),
      previewManifest: preview.manifestPath,
      canonicalManifest: canonical.manifestPath,
      comparison,
    });
    console.log('\nDESKTOP PRODUCTION PARITY PASSED');
    console.log(`Report: ${reportPath}`);
    return { comparison, reportPath };
  });
}

/** 构建 Preview 后显式启动产物；普通 desktop:preview 永远不会自动运行。 */
async function buildAndOpenPreview() {
  const result = await runPackagingMode(modeDefinitions.preview);
  const child = spawn(result.executablePath, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

/** 启动本地 Next dev server 后运行 Electron；退出 Electron 时一并回收开发服务器。 */
async function runDevelopmentShell() {
  const rendererUrl =
    process.env.THREADLINE_ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:3118';
  const rendererPort = new URL(rendererUrl).port;
  const nextProcess = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--port', rendererPort],
    { stdio: 'inherit' },
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

try {
  if (command === 'renderer') {
    await buildRenderer();
  } else if (command === 'preview') {
    await runPackagingMode(modeDefinitions.preview);
  } else if (command === 'preview-open') {
    await buildAndOpenPreview();
  } else if (command === 'verify-parity') {
    await verifyProductionParity();
  } else if (command === 'package-dir') {
    await runPackagingMode(modeDefinitions['package-dir']);
  } else if (command === 'package') {
    await runPackagingMode(modeDefinitions.package);
  } else if (command === 'release') {
    await runPackagingMode(modeDefinitions.release);
  } else if (command === 'dev') {
    await runDevelopmentShell();
  } else {
    throw new Error(
      'Usage: pnpm desktop:renderer | desktop:dev | desktop:preview | desktop:preview:open | desktop:verify:parity | desktop:build:dir | desktop:build | desktop:release',
    );
  }
} catch (error) {
  if (error instanceof DesktopBuildError) {
    console.error(`\n${error.code}`);
    console.error(error.message);
    if (Object.keys(error.details ?? {}).length > 0) {
      console.error(JSON.stringify(error.details, null, 2));
    }
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
