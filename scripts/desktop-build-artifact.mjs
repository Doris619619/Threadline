/**
 * @fileoverview 验证 Threadline packaged app、生成可追溯 manifest，并比较 Preview 与正式目录包内容。
 */

import * as asar from '@electron/asar';
import fuses from '@electron/fuses';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { DesktopBuildError } from './desktop-build-runtime.mjs';

const { getCurrentFuseWire } = fuses;
const REQUIRED_ASAR_ENTRIES = [
  '\\dist-electron\\main.cjs',
  '\\dist-electron\\preload.cjs',
  '\\.next-electron\\index.html',
  '\\.next-electron\\threadline-csp.json',
  '\\package.json',
];

/** 以流式 SHA-256 标识构建输入与产物，避免把大文件完整读入内存。 */
export async function hashFile(filePath) {
  const handle = await import('node:fs');
  const hash = createHash('sha256');
  await new Promise((resolveHash, rejectHash) => {
    const stream = handle.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', rejectHash);
    stream.once('end', resolveHash);
  });
  return hash.digest('hex');
}

/** 列出目录中的相对文件及大小；后续仅在大小相同后计算 hash，减少 parity 开销。 */
async function collectFileTree(rootPath, ignoredRelativePaths = new Set()) {
  const files = new Map();
  async function visit(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const childPath = join(currentPath, entry.name);
      const relativePath = relative(rootPath, childPath).replaceAll('\\', '/');
      if (ignoredRelativePaths.has(relativePath.toLowerCase())) continue;
      if (entry.isDirectory()) await visit(childPath);
      else if (entry.isFile()) {
        const details = await stat(childPath);
        files.set(relativePath, { path: childPath, size: details.size });
      }
    }
  }
  await visit(rootPath);
  return files;
}

/** 验证 EXE/ASAR 均由本轮生成，且 ASAR 包含 Main、Preload、Renderer、CSP 与 package metadata。 */
export async function verifyPackagedArtifact({ executablePath, buildStartedAt }) {
  const asarPath = join(dirname(executablePath), 'resources', 'app.asar');
  let executableStat;
  let asarStat;
  try {
    [executableStat, asarStat] = await Promise.all([
      stat(executablePath),
      stat(asarPath),
    ]);
  } catch (error) {
    throw new DesktopBuildError(
      'DESKTOP_BUILD_ARTIFACT_MISSING',
      `Packaged artifact is incomplete: ${error.message}`,
    );
  }
  if (
    executableStat.mtimeMs < buildStartedAt - 1_000 ||
    asarStat.mtimeMs < buildStartedAt - 1_000
  ) {
    throw new DesktopBuildError(
      'DESKTOP_BUILD_STALE_ARTIFACT',
      'Packaged EXE or ASAR predates the current build.',
      { executableMtime: executableStat.mtime, asarMtime: asarStat.mtime },
    );
  }
  if (executableStat.size === 0 || asarStat.size === 0) {
    throw new DesktopBuildError(
      'DESKTOP_BUILD_ARTIFACT_EMPTY',
      'Packaged EXE or ASAR is empty.',
    );
  }
  const entries = new Set(asar.listPackage(asarPath));
  const missingEntries = REQUIRED_ASAR_ENTRIES.filter((entry) => !entries.has(entry));
  if (missingEntries.length > 0) {
    throw new DesktopBuildError(
      'DESKTOP_BUILD_ASAR_INVALID',
      'Packaged ASAR is missing production application entries.',
      { missingEntries },
    );
  }
  return {
    executable: {
      path: resolve(executablePath),
      size: executableStat.size,
      sha256: await hashFile(executablePath),
      mtime: executableStat.mtime.toISOString(),
    },
    asar: {
      status: 'verified',
      path: resolve(asarPath),
      size: asarStat.size,
      sha256: await hashFile(asarPath),
      entries: entries.size,
    },
    fuseWire: await getCurrentFuseWire(executablePath),
  };
}

/** 原子写入成功 manifest；目标文件永远不会处于半写入状态。 */
export async function writeBuildManifest(manifestPath, manifest) {
  await mkdir(dirname(manifestPath), { recursive: true });
  const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, manifestPath);
}

/** 比较两棵目录的文件集合、大小与 hash，返回全部差异而不是首个差异。 */
async function compareFileTrees(leftRoot, rightRoot, ignoredRelativePaths) {
  const [leftFiles, rightFiles] = await Promise.all([
    collectFileTree(leftRoot, ignoredRelativePaths),
    collectFileTree(rightRoot, ignoredRelativePaths),
  ]);
  const names = new Set([...leftFiles.keys(), ...rightFiles.keys()]);
  const differences = [];
  for (const name of [...names].sort()) {
    const left = leftFiles.get(name);
    const right = rightFiles.get(name);
    if (!left || !right) {
      differences.push({ path: name, reason: left ? 'missing-right' : 'missing-left' });
      continue;
    }
    if (left.size !== right.size) {
      differences.push({
        path: name,
        reason: 'size',
        left: left.size,
        right: right.size,
      });
      continue;
    }
    const [leftHash, rightHash] = await Promise.all([
      hashFile(left.path),
      hashFile(right.path),
    ]);
    if (leftHash !== rightHash) {
      differences.push({
        path: name,
        reason: 'sha256',
        left: leftHash,
        right: rightHash,
      });
    }
  }
  return differences;
}

/** 当 ASAR 整体 hash 不同时解包比较实际文件，区分内容差异与容器级非确定性。 */
async function compareAsarContents(leftAsar, rightAsar) {
  if ((await hashFile(leftAsar)) === (await hashFile(rightAsar))) {
    return { byteIdentical: true, differences: [] };
  }
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'threadline-asar-parity-'));
  const leftRoot = join(temporaryRoot, 'left');
  const rightRoot = join(temporaryRoot, 'right');
  try {
    await mkdir(leftRoot);
    await mkdir(rightRoot);
    asar.extractAll(leftAsar, leftRoot);
    asar.extractAll(rightAsar, rightRoot);
    return {
      byteIdentical: false,
      differences: await compareFileTrees(leftRoot, rightRoot, new Set()),
    };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

/**
 * 比较 Preview 与 canonical packaged-dir；只忽略会承载 ASAR integrity/fuse metadata 的 PE 本体，随后单独比较 fuse wire 与 ASAR 内容。
 */
export async function comparePackagedApplications({
  previewExecutable,
  canonicalExecutable,
}) {
  const previewRoot = dirname(previewExecutable);
  const canonicalRoot = dirname(canonicalExecutable);
  const previewAsar = join(previewRoot, 'resources', 'app.asar');
  const canonicalAsar = join(canonicalRoot, 'resources', 'app.asar');
  const ignored = new Set(['threadline.exe', 'resources/app.asar']);
  const [treeDifferences, asarComparison, previewFuseWire, canonicalFuseWire] =
    await Promise.all([
      compareFileTrees(previewRoot, canonicalRoot, ignored),
      compareAsarContents(previewAsar, canonicalAsar),
      getCurrentFuseWire(previewExecutable),
      getCurrentFuseWire(canonicalExecutable),
    ]);
  return evaluateParityComparison({
    treeDifferences,
    asarComparison,
    previewFuseWire,
    canonicalFuseWire,
  });
}

/** 汇总 parity 原始比较结果；任何运行相关文件或 fuse 差异都会稳定失败。 */
export function evaluateParityComparison({
  treeDifferences,
  asarComparison,
  previewFuseWire,
  canonicalFuseWire,
}) {
  const fuseWireMatches =
    JSON.stringify(previewFuseWire) === JSON.stringify(canonicalFuseWire);
  if (
    treeDifferences.length > 0 ||
    asarComparison.differences.length > 0 ||
    !fuseWireMatches
  ) {
    throw new DesktopBuildError(
      'DESKTOP_BUILD_PARITY_FAILED',
      'Preview and canonical packaged app differ in runtime-significant content.',
      {
        treeDifferences,
        asarDifferences: asarComparison.differences,
        fuseWireMatches,
      },
    );
  }
  return {
    status: 'passed',
    appAsarByteIdentical: asarComparison.byteIdentical,
    packagedTreeDifferences: 0,
    fuseWireMatches,
    executableByteComparison: 'not-required-pe-metadata-verified-separately',
  };
}

/** 输出稳定、可复制的构建成功摘要，不再依赖目录中的旧文件判断成功。 */
export function printBuildSuccess(manifest, manifestPath) {
  const artifact = manifest.artifacts.find(
    (item) => item.kind === 'packaged-executable',
  );
  console.log('\nPREVIEW SUCCESS');
  console.log(`Commit: ${manifest.commit}`);
  console.log(`Working tree: ${manifest.workingTree.toUpperCase()}`);
  console.log(`Built at: ${manifest.builtAt}`);
  console.log(`Electron: ${manifest.versions.electron}`);
  console.log(`electron-builder: ${manifest.versions.electronBuilder}`);
  console.log(`EXE: ${artifact.path}`);
  console.log(`Size: ${artifact.size}`);
  console.log('ASAR: verified');
  console.log('Fuses: verified');
  console.log(`Manifest: ${resolve(manifestPath)}`);
}

/** 复制 parity 报告到稳定路径；供未来 AI 在不重跑构建时读取最近一次结论。 */
export async function copyParityReport(sourcePath, destinationPath) {
  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

/** 读取已有 manifest 并确保 JSON 结构可解析，供验证与后续报告复用。 */
export async function readBuildManifest(manifestPath) {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}
