/**
 * @fileoverview 冻结 Windows Desktop Preview 构建锁、输出安全、stall 与 parity 判定契约。
 */

import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  evaluateParityComparison,
  writeBuildManifest,
} from '../scripts/desktop-build-artifact.mjs';
import {
  acquireDesktopBuildLock,
  assertNoConflictingDesktopProcess,
  collectGitState,
  hasPackagingStalled,
  releaseDesktopBuildLock,
  removeAllowedBuildTarget,
  runDesktopCommand,
} from '../scripts/desktop-build-runtime.mjs';

const temporaryRoots: string[] = [];

/** 为每个测试创建独立临时目录，避免触碰仓库真实 release 与 lock。 */
async function createTemporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'threadline-desktop-build-test-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('desktop build lock', () => {
  test('active lock refuses a second packaging process', async () => {
    const root = await createTemporaryRoot();
    const lockPath = join(root, 'desktop.lock.json');
    const first = await acquireDesktopBuildLock({
      lockPath,
      metadata: { command: 'preview', outputPath: root },
    });

    await expect(
      acquireDesktopBuildLock({
        lockPath,
        metadata: { command: 'release', outputPath: root },
      }),
    ).rejects.toMatchObject({ code: 'DESKTOP_BUILD_ALREADY_RUNNING' });

    await releaseDesktopBuildLock(lockPath, first);
  });

  test('stale lock is replaced only after all recorded PIDs are gone', async () => {
    const root = await createTemporaryRoot();
    const lockPath = join(root, 'desktop.lock.json');
    await writeFile(
      lockPath,
      JSON.stringify({ nonce: 'stale', pid: 41, builderPid: 42 }),
      'utf8',
    );
    const lock = await acquireDesktopBuildLock({
      lockPath,
      metadata: { command: 'preview', outputPath: root },
      processIsAlive: () => false,
    });

    expect(lock.nonce).not.toBe('stale');
    await releaseDesktopBuildLock(lockPath, lock);
  });
});

describe('desktop build preflight', () => {
  test('only allowlisted output paths can be removed', async () => {
    const root = await createTemporaryRoot();
    const preview = join(root, 'preview');
    const unrelated = join(root, 'unrelated');
    await mkdir(preview);
    await mkdir(unrelated);

    await removeAllowedBuildTarget(preview, [preview]);
    await expect(stat(preview)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(removeAllowedBuildTarget(unrelated, [preview])).rejects.toMatchObject({
      code: 'DESKTOP_BUILD_UNSAFE_OUTPUT',
    });
    await expect(stat(unrelated)).resolves.toBeDefined();
  });

  test('running target executable is rejected without killing it', () => {
    const target =
      'D:\\Repo\\Threadline\\release\\preview\\win-unpacked\\Threadline.exe';
    expect(() =>
      assertNoConflictingDesktopProcess({
        repositoryRoot: 'D:\\Repo\\Threadline',
        targetExecutable: target,
        inspection: {
          status: 'available',
          processes: [{ ProcessId: 123, ExecutablePath: target, CommandLine: target }],
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'DESKTOP_TARGET_RUNNING' }));
  });

  test('Git metadata explicitly reports current dirty or clean state', () => {
    const state = collectGitState(process.cwd());
    expect(state.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(['clean', 'dirty']).toContain(state.workingTree);
    expect(Array.isArray(state.dirtyPaths)).toBe(true);
  });
});

describe('packaging progress monitoring', () => {
  test('stall decision uses the last observable progress time', () => {
    expect(
      hasPackagingStalled({ now: 1_179, lastProgressAt: 1_000, stallMs: 180 }),
    ).toBe(false);
    expect(
      hasPackagingStalled({ now: 1_180, lastProgressAt: 1_000, stallMs: 180 }),
    ).toBe(true);
  });

  test('ongoing output prevents a false packaging stall', async () => {
    const root = await createTemporaryRoot();
    const result = await runDesktopCommand({
      commandName: process.execPath,
      argumentsList: [
        '-e',
        "let count=0; const timer=setInterval(()=>{ console.log('progress'); if(++count===4){clearInterval(timer)} },100)",
      ],
      cwd: root,
      label: 'progress-test',
      monitorDirectory: root,
      stallMs: 1_000,
    });
    expect(result.status).toBe('passed');
  });

  test('silent owned child is stopped and reported as PACKAGING_STALL', async () => {
    const root = await createTemporaryRoot();
    await expect(
      runDesktopCommand({
        commandName: process.execPath,
        argumentsList: ['-e', 'setInterval(()=>{},1000)'],
        cwd: root,
        label: 'stall-test',
        monitorDirectory: root,
        stallMs: 100,
      }),
    ).rejects.toMatchObject({ code: 'PACKAGING_STALL' });
  });
});

describe('manifest and parity contract', () => {
  test('manifest is completely written as parseable JSON', async () => {
    const root = await createTemporaryRoot();
    const manifestPath = join(root, 'build-manifest.json');
    await writeBuildManifest(manifestPath, { schemaVersion: 1, status: 'passed' });
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual({
      schemaVersion: 1,
      status: 'passed',
    });
  });

  test('runtime file differences fail production parity', () => {
    expect(() =>
      evaluateParityComparison({
        treeDifferences: [{ path: 'resources.pak', reason: 'sha256' }],
        asarComparison: { byteIdentical: true, differences: [] },
        previewFuseWire: [0, 1],
        canonicalFuseWire: [0, 1],
      }),
    ).toThrowError(expect.objectContaining({ code: 'DESKTOP_BUILD_PARITY_FAILED' }));
  });

  test('fuse differences fail production parity', () => {
    expect(() =>
      evaluateParityComparison({
        treeDifferences: [],
        asarComparison: { byteIdentical: true, differences: [] },
        previewFuseWire: [0, 1],
        canonicalFuseWire: [0, 0],
      }),
    ).toThrowError(expect.objectContaining({ code: 'DESKTOP_BUILD_PARITY_FAILED' }));
  });

  test('identical runtime inputs produce a passed parity result', () => {
    expect(
      evaluateParityComparison({
        treeDifferences: [],
        asarComparison: { byteIdentical: true, differences: [] },
        previewFuseWire: [0, 1],
        canonicalFuseWire: [0, 1],
      }),
    ).toMatchObject({ status: 'passed', fuseWireMatches: true });
  });
});
