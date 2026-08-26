import type { NextConfig } from 'next';

const isElectronBuild = process.env.ELECTRON_BUILD === 'true';

const nextConfig: NextConfig = {
  // Electron export remains isolated so the normal Next Web/PWA server flow
  // keeps its server rendering behavior.
  ...(isElectronBuild ? { output: 'export', distDir: '.next-electron' } : {}),
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
