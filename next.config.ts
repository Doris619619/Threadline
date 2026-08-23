import type { NextConfig } from 'next';

const isTauriBuild = process.env.TAURI_ENV_PLATFORM === 'windows';

const nextConfig: NextConfig = {
  // Tauri sets this variable for its build hook. Keeping static export scoped to
  // that hook preserves the existing `pnpm build && pnpm start` Web/PWA flow.
  ...(isTauriBuild ? { output: 'export', distDir: '.next-tauri' } : {}),
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
