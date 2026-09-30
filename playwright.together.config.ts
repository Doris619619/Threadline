/** @fileoverview localhost 两人空间专用浏览器验收，连接独立 PostgreSQL 测试桥，不访问正式服务。 */
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: ['together.spec.ts', 'together-regressions.spec.ts'],
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  webServer: [
    {
      command: 'node scripts/together/preview-server.mjs',
      url: 'http://127.0.0.1:3102/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command:
        'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100',
      url: 'http://127.0.0.1:3100/together-preview',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        THREADLINE_TOGETHER_PREVIEW: 'true',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3102',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_together_preview',
        NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: 'true',
      },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
