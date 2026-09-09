/** @fileoverview 用现有测试 Renderer 和正式打包合同生成隔离身份的两版 NSIS；仅供本地升级验收。 */
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  runDesktopCommand,
  acquireDesktopBuildLock,
  releaseDesktopBuildLock,
} from './desktop-build-runtime.mjs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const config = require('../electron-builder.config.cjs');
const root = resolve('.tmp/update-validation');
if (process.env.NEXT_PUBLIC_THREADLINE_TEST_ADAPTER !== 'true')
  throw new Error(
    'Build test-adapter renderer first; explicit test environment required.',
  );
if (!process.env.npm_execpath)
  throw new Error('Run via pnpm test:desktop:update:build.');
const lockPath = resolve('.tmp/desktop-packaging.lock.json');
const lock = await acquireDesktopBuildLock({
  lockPath,
  metadata: { command: 'update-validation', outputPath: root },
});
try {
  for (const scriptArgs of [
    ['scripts/build-electron.mjs'],
    ['scripts/electron.mjs', 'renderer'],
  ]) {
    const prepared = spawnSync(process.execPath, scriptArgs, {
      stdio: 'inherit',
      windowsHide: true,
    });
    if (prepared.status !== 0)
      throw new Error(`Validation preparation failed: ${scriptArgs[0]}`);
  }

  if (!(await readFile('.next-electron/index.html', 'utf8')).includes('<html'))
    throw new Error('Missing renderer.');
  await mkdir(root, { recursive: true });
  for (const version of ['0.1.1', '0.1.2']) {
    const fixture = {
      ...config,
      appId: 'com.doris619619.threadline-update-validation',
      productName: 'Threadline Update Validation',
      extraMetadata: {
        ...config.extraMetadata,
        name: 'threadline-update-validation',
        productName: 'Threadline Update Validation',
        version,
      },
      directories: { output: join(root, version) },
      publish: { provider: 'generic', url: 'http://127.0.0.1:3197/' },
      nsis: {
        ...config.nsis,
        createDesktopShortcut: false,
        createStartMenuShortcut: false,
        shortcutName: 'Threadline Update Validation',
      },
      artifactName: 'Threadline-validation-${version}.${ext}',
    };
    const path = join(root, `builder-${version}.json`);
    await writeFile(path, JSON.stringify(fixture, null, 2));
    const collector = await mkdtemp(join(tmpdir(), 'threadline-validation-store-'));
    try {
      await runDesktopCommand({
        commandName: process.execPath,
        argumentsList: [
          'node_modules/electron-builder/out/cli/cli.js',
          '--config',
          path,
          '--win',
          'nsis',
          '--x64',
          '--publish',
          'never',
        ],
        cwd: resolve('.'),
        environment: { ...process.env, PNPM_CONFIG_STORE_DIR: collector },
        label: `update-validation-${version}`,
        logPath: join(root, `build-${version}.log`),
        monitorDirectory: join(root, version),
        stallMs: 180000,
      });
    } finally {
      await rm(collector, { recursive: true, force: true });
    }
  }
} finally {
  await releaseDesktopBuildLock(lockPath, lock);
}
