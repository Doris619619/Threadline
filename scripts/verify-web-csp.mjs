/**
 * @fileoverview 启动真实 Next production server，验证 Web nonce CSP 的响应与页面标记。
 */

import { spawn } from 'node:child_process';

const port = 31_000 + Math.floor(Math.random() * 2_000);
const origin = `http://127.0.0.1:${port}`;
let stderr = '';

/** 在限时内等待 Next server 返回首页，保留最后一次连接错误供失败诊断。 */
async function waitForResponse() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Web CSP server did not become ready: ${lastError ?? stderr}`);
}

/** 从 script-src 中提取当前请求的 nonce，缺失时立即失败。 */
function readNonce(policy) {
  const match = policy.match(/script-src[^;]*'nonce-([^']+)'/);
  if (!match) throw new Error(`Web CSP response is missing script nonce: ${policy}`);
  return match[1];
}

/** 配置 Supabase 时要求 connect-src 同时精确包含 REST/Auth 与 Realtime origin。 */
function verifySupabaseOrigins(policy) {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configured) return;
  const url = new URL(configured);
  const realtime = `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`;
  if (!policy.includes(url.origin) || !policy.includes(realtime))
    throw new Error('Web CSP is missing the exact Supabase HTTPS/WS origins.');
  const connectSource = policy.match(/connect-src ([^;]+)/)?.[1] ?? '';
  if (connectSource.includes('*'))
    throw new Error('Web CSP must not use a wildcard Supabase connect source.');
}

const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--port', String(port)],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
server.stderr.on('data', (chunk) => {
  stderr += String(chunk);
});

try {
  const first = await waitForResponse();
  const firstPolicy = first.headers.get('content-security-policy') ?? '';
  verifySupabaseOrigins(firstPolicy);
  const firstNonce = readNonce(firstPolicy);
  const html = await first.text();
  if (!html.includes(`nonce="${firstNonce}"`))
    throw new Error('Next did not attach the response nonce to rendered scripts');
  if (!firstPolicy.includes("style-src-attr 'unsafe-inline'"))
    throw new Error('Dynamic React style attributes are not scoped by style-src-attr');
  if (/style-src (?![^;]*nonce)[^;]*'unsafe-inline'/.test(firstPolicy))
    throw new Error('Web CSP broadly enabled unsafe-inline in style-src');

  const second = await fetch(origin);
  const secondNonce = readNonce(second.headers.get('content-security-policy') ?? '');
  if (secondNonce === firstNonce)
    throw new Error('Web CSP reused a nonce across separate requests');
  console.log('Verified request-time Web nonce CSP');
} finally {
  server.kill();
}
