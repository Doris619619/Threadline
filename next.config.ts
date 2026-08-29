import type { NextConfig } from 'next';

const isElectronBuild = process.env.ELECTRON_BUILD === 'true';

const nextConfig: NextConfig = {
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
