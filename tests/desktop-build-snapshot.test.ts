/** @fileoverview 在真实 Node 子进程中复现 builder 临时文件删除竞态，验证快照不掩盖其他文件系统错误。 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';
const roots: string[] = [];
const run = promisify(execFile);

/** 回收每次测试自己创建的临时目录，不使用真实 release。 */
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

/** 在原生 ESM 的 stat 入口模拟 builder 删除文件，避免测试转换器改变内置模块绑定。 */
async function snapshotAfterFilesystemChange(failure: 'ENOENT' | 'EACCES') {
  const root = await mkdtemp(join(tmpdir(), 'threadline-snapshot-test-'));
  roots.push(root);
  await writeFile(join(root, 'temporary.nsis.7z'), 'temporary archive');
  await writeFile(join(root, 'setup.exe'), 'installer');
  const source = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const [runtime, root, failure] = process.argv.slice(1);
    const original = fs.promises.stat;
    fs.promises.stat = async (path) => {
      if(failure === 'EACCES') throw Object.assign(new Error('denied'), {code:failure});
      if(String(path).endsWith('temporary.nsis.7z')) await fs.promises.unlink(path);
      return original(path);
    };
    syncBuiltinESMExports();
    const {snapshotDirectoryTree} = await import(runtime);
    try { console.log(JSON.stringify(await snapshotDirectoryTree(root))); }
    catch(error) { console.log(JSON.stringify({error:error.code})); }
  `;
  const result = await run(process.execPath, [
    '--input-type=module',
    '-e',
    source,
    pathToFileURL(resolve(import.meta.dirname, '../scripts/desktop-build-runtime.mjs'))
      .href,
    root,
    failure,
  ]);
  return JSON.parse(result.stdout);
}

test('snapshot survives builder deleting a listed temporary archive before stat', async () => {
  const snapshot = await snapshotAfterFilesystemChange('ENOENT');
  expect(snapshot).not.toHaveProperty('error');
  expect(snapshot.files).toBe(1);
  expect(snapshot.bytes).toBe(Buffer.byteLength('installer'));
  expect(snapshot.latestMtimeMs).toBeGreaterThan(0);
});

test('snapshot preserves permission failures instead of ignoring them', async () => {
  expect(await snapshotAfterFilesystemChange('EACCES')).toEqual({ error: 'EACCES' });
});
