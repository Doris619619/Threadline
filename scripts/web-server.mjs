/**
 * @fileoverview 为 Next Web/PWA 生产服务加载构建时 CSP manifest，而不放宽内联脚本策略。
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import next from 'next';

/** 从命令行读取端口，保持与 next start 的 --port 用法兼容。 */
function resolvePort() {
  const index = process.argv.indexOf('--port');
  const value = index >= 0 ? process.argv[index + 1] : process.env.PORT;
  const port = Number(value ?? 3000);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error(`Invalid production server port: ${value}`);
  return port;
}

const manifest = JSON.parse(await readFile('.next/threadline-csp.json', 'utf8'));
const application = next({ dev: false });
await application.prepare();
const handle = application.getRequestHandler();
const port = resolvePort();

createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const policy = manifest.routes[pathname]?.header ?? manifest.routes['/']?.header;
  if (policy) response.setHeader('Content-Security-Policy', policy);
  void handle(request, response);
}).listen(port, '127.0.0.1', () => {
  console.log(
    `Threadline Web/PWA production server listening on http://127.0.0.1:${port}`,
  );
});
