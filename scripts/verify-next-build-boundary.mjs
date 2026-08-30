/**
 * @fileoverview 验证 Web 与 Electron Next 产物严格落在各自的 Proxy/CSP 构建边界内。
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const [mode] = process.argv.slice(2);
if (mode !== 'web' && mode !== 'electron') {
  throw new Error('Usage: node scripts/verify-next-build-boundary.mjs <web|electron>');
}

/** 读取 Next middleware manifest；不存在时按空对象处理。 */
async function readMiddlewareManifest(directory) {
  const path = join(directory, 'server', 'middleware-manifest.json');
  return existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : {};
}

const directory = mode === 'web' ? '.next' : '.next-electron';
const manifest = await readMiddlewareManifest(directory);
const proxyEntries = Object.keys(manifest.middleware ?? {});
const cspManifest = join(directory, 'threadline-csp.json');

if (mode === 'web') {
  if (proxyEntries.length === 0)
    throw new Error('Web build did not emit the nonce Proxy');
  if (existsSync(cspManifest))
    throw new Error('Web build must not consume the static HTML CSP manifest');
} else {
  if (proxyEntries.length > 0)
    throw new Error(
      `Electron build unexpectedly emitted Proxy: ${proxyEntries.join(', ')}`,
    );
  if (!existsSync(join(directory, 'index.html')))
    throw new Error('Electron static export did not emit index.html');
  if (!existsSync(cspManifest))
    throw new Error('Electron build did not emit the hash CSP manifest');
}

console.log(`Verified ${mode} Next build boundary in ${directory}`);
