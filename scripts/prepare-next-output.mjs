/** @fileoverview 在 Next 构建前只清理当前 pipeline 的精确输出目录，避免跨模式残留缓存。 */

import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const targets = {
  web: resolve(repositoryRoot, '.next'),
  electron: resolve(repositoryRoot, '.next-electron'),
};
const mode = process.argv[2];
const target = targets[mode];

if (!target || dirname(target) !== repositoryRoot)
  throw new Error(`Refusing unknown Next output mode: ${mode ?? '<missing>'}`);

await rm(target, { force: true, recursive: true });
console.log(`Prepared isolated ${mode} Next output.`);
