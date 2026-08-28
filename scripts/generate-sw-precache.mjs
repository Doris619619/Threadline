/**
 * @fileoverview 从 Web 或 Electron 的 Next 构建产物收集 hashed 静态资源，生成 Service Worker 安装时使用的 precache 清单。
 */

import { readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const [buildDirectory] = process.argv.slice(2);
if (!buildDirectory)
  throw new Error('Usage: node scripts/generate-sw-precache.mjs <build-directory>');

/** 递归读取目录内的文件相对路径，供产物目录转换为浏览器 URL。 */
async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listFiles(path);
      return [path];
    }),
  );
  return children.flat();
}

const isElectronExport = buildDirectory === '.next-electron';
const assetDirectory = isElectronExport
  ? join(buildDirectory, '_next')
  : join(buildDirectory, 'static');
const publicPrefix = isElectronExport ? '/_next' : '/_next/static';
const assets = (await listFiles(assetDirectory)).map(
  (file) => `${publicPrefix}/${relative(assetDirectory, file).split(sep).join('/')}`,
);
const manifestPath = isElectronExport
  ? join(buildDirectory, 'sw-precache.json')
  : join('public', 'sw-precache.json');

await writeFile(manifestPath, `${JSON.stringify({ assets }, null, 2)}\n`, 'utf8');
