import type { NextConfig } from 'next';

const isTauriBuild = process.env.TAURI_ENV_PLATFORM === 'windows';
const isElectronBuild = process.env.ELECTRON_BUILD === 'true';

const nextConfig: NextConfig = {
  // Desktop export remains isolated so the normal Next Web/PWA server flow keeps
  // its server rendering behavior until Electron becomes the only desktop shell.
  ...(isElectronBuild
    ? { output: 'export', distDir: '.next-electron' }
    : isTauriBuild
      ? { output: 'export', distDir: '.next-tauri' }
      : {}),
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
