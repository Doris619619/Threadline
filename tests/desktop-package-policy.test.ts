/** @fileoverview 用真实 builder matcher 与隔离依赖树验证桌面裁剪不会漏掉嵌套、scoped 或 peer 依赖。 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import policy from '../scripts/desktop-package-policy.cjs';

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('electron-builder/package.json'));
const { FileMatcher } = builderRequire('app-builder-lib/out/fileMatcher.js');
const roots: string[] = [];

/** 写入独立临时依赖包，不触碰仓库实际 node_modules。 */
async function fixturePackage(root: string, name: string, metadata = {}) {
  const directory = join(root, 'node_modules', name);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ name, ...metadata }),
  );
  return directory;
}

/** 只回收本测试创建并记录的临时根目录。 */
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test('follows nested versions, scoped dependencies and required peers without copying unrelated packages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'threadline-package-policy-'));
  roots.push(root);
  await writeFile(join(root, 'package.json'), '{}');
  const updater = await fixturePackage(root, 'updater', {
    dependencies: { shared: '1', '@scope/runtime': '1' },
    peerDependencies: { peer: '1', electron: '*' },
    optionalDependencies: { absent: '1' },
  });
  await fixturePackage(root, 'shared', { dependencies: { wrong: '1' } });
  await fixturePackage(updater, 'shared');
  await fixturePackage(root, '@scope/runtime');
  await fixturePackage(root, 'peer');
  expect(policy.collectRuntimeDependencies(root, ['updater'])).toEqual([
    '@scope/runtime',
    'peer',
    'shared',
    'updater',
  ]);
  await expect(
    fixturePackage(root, 'broken', { dependencies: { missing: '1' } }),
  ).resolves.toBeTruthy();
  expect(() => policy.collectRuntimeDependencies(root, ['broken'])).toThrow();
});

test('builder filter keeps runtime files and nested modules but rejects frontend and compiler directories', () => {
  const matcher = new FileMatcher('source', 'destination', (value: string) => value, [
    '**/*',
    ...policy.dependencyExclusions(['electron-updater', 'semver', '@scope/runtime']),
  ]);
  const filter = matcher.createFilter();
  /** 使用 builder 在复制依赖时实际传入的目标路径 metadata 测试目录剪枝和文件过滤。 */
  const accepts = (path: string, directory = false) =>
    filter(`source/${path}`, {
      moduleFullFilePath: path,
      isDirectory: () => directory,
    });
  for (const path of [
    'node_modules/electron-updater/out/main.js',
    'node_modules/semver/package.json',
    'node_modules/electron-updater/node_modules/semver/index.js',
    'node_modules/@scope/runtime/index.js',
  ])
    expect(accepts(path)).toBe(true);
  for (const path of [
    'node_modules/next',
    'node_modules/next/dist/server',
    'node_modules/@next/swc-win32-x64-msvc',
    'node_modules/@scope/unrelated',
  ]) {
    expect(accepts(path, true)).toBe(false);
    expect(accepts(`${path}/package.json`)).toBe(false);
  }
});
