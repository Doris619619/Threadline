/** @fileoverview 配置 Web/Electron 构建边界，并为无云配置的 Vercel Preview 自动启用浏览器演示。 */
import type { NextConfig } from 'next';

const isElectronBuild = process.env.ELECTRON_BUILD === 'true';
// 只由部署环境推导，禁止用一个公开环境变量把 Production 切换成演示。
const isPreviewDemo =
  !isElectronBuild &&
  process.env.VERCEL_ENV === 'preview' &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
  !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_THREADLINE_PREVIEW_DEMO: isPreviewDemo ? 'true' : 'false',
  },
  // Web routes use a nonce-aware .web entry set. Electron deliberately ignores
  // those files so static export never discovers the unsupported Web Proxy.
  pageExtensions: isElectronBuild
    ? ['electron.tsx', 'electron.ts']
    : ['web.tsx', 'web.ts'],
  ...(isElectronBuild ? { output: 'export', distDir: '.next-electron' } : {}),
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
