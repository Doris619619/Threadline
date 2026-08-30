/**
 * @fileoverview 为 Web/PWA 请求生成 nonce CSP；Electron pageExtensions 不会发现本文件。
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/** 返回配置中的 Supabase HTTPS/WSS origin；未配置环境在 Auth 接入阶段由页面门禁处理。 */
function getSupabaseOrigins() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return [];
  const origin = new URL(value).origin;
  const realtimeOrigin = origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return [origin, realtimeOrigin];
}

/** 创建每请求严格 CSP；动态 React style attribute 仅由 style-src-attr 单独放行。 */
function createWebCsp(nonce: string) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const connectSources = ["'self'", ...getSupabaseOrigins()].join(' ');
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `connect-src ${connectSources}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** 注入请求 nonce 与响应 CSP；静态资源不进入 Proxy。 */
export default function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = createWebCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|sw-precache.json).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
