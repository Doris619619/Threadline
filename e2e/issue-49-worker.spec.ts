/** @fileoverview 用真实注册的 Service Worker 和同源两版资源验证更新、离线回退及缓存命名空间。 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';

test('N08 refreshes stable assets while preserving hashed chunks and unrelated caches', async ({
  browser,
}) => {
  let version = 1;
  const worker = await readFile('public/sw.js', 'utf8');
  const publicRoot = resolve('public');
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/sw.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(worker);
    } else if (request.url === '/sw-precache.json') {
      response.setHeader('Content-Type', 'application/json');
      response.end('{"assets":[]}');
    } else if (request.url === '/icon.svg') {
      response.setHeader('Content-Type', 'image/svg+xml');
      response.end(
        `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>version-${version}</title><rect width="10" height="10" fill="red"/></svg>`,
      );
    } else if (request.url === '/_next/static/chunks/123456abcdef.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(`window.assetVersion=${version}`);
    } else if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Worker test</title>');
    } else {
      // 安装阶段使用真实壳资源，避免测试把正常预缓存退化成大量 404。
      const path = resolve(publicRoot, `.${request.url}`);
      try {
        if (!path.startsWith(`${publicRoot}${sep}`)) throw new Error('Invalid path');
        response.end(await readFile(path));
      } catch {
        response.statusCode = 404;
        response.end('missing');
      }
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local address');
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.evaluate(async () => {
      await caches.open('other-application');
      await caches.open('threadline-shell-v0');
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    expect(await page.evaluate(() => caches.keys())).toContain('other-application');
    expect(await page.evaluate(() => caches.keys())).not.toContain(
      'threadline-shell-v0',
    );
    /** 使用真实 image destination，不能用普通 fetch 绕过旧 cache-first 分支。 */
    const image = () =>
      page.evaluate(async () => {
        const image = new Image();
        image.src = '/icon.svg';
        document.body.append(image);
        await image.decode();
        image.remove();
      });
    await image();
    await expect
      .poll(() => page.evaluate(async () => (await caches.match('/icon.svg'))?.text()))
      .toContain('version-1');
    await page.addScriptTag({ url: '/_next/static/chunks/123456abcdef.js' });
    version = 2;
    // 新文档触发同 URL 请求，避免同一文档的已解码 Image 内存复用绕过网络与 SW。
    await page.reload();
    await image();
    await expect
      .poll(() => page.evaluate(async () => (await caches.match('/icon.svg'))?.text()))
      .toContain('version-2');
    await page.addScriptTag({ url: '/_next/static/chunks/123456abcdef.js' });
    expect(
      await page.evaluate(
        () => (window as unknown as { assetVersion: number }).assetVersion,
      ),
    ).toBe(1);
    await context.setOffline(true);
    await page.reload();
    await image();
    expect(
      await page.evaluate(async () => (await caches.match('/icon.svg'))?.text()),
    ).toContain('version-2');
    const chunk = await page.evaluate(async () => {
      const response = await fetch('/_next/static/chunks/123456abcdef.js');
      return {
        type: response.headers.get('content-type'),
        text: await response.text(),
      };
    });
    expect(chunk.type).toContain('javascript');
    expect(chunk.text).not.toContain('<html');
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
