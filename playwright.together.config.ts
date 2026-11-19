/** @fileoverview localhost 两人空间专用浏览器验收，连接独立 PostgreSQL 测试桥，不访问正式服务。 */
import { defineConfig } from '@playwright/test';
const previewPort = Number(process.env.THREADLINE_TOGETHER_PREVIEW_PORT ?? 3102);
const e2ePort = Number(process.env.THREADLINE_TOGETHER_E2E_PORT ?? 3100);
for (const port of [previewPort, e2ePort]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Together test ports must be integers between 1 and 65535');
}
const previewOrigin = `http://127.0.0.1:${previewPort}`;
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;
export default defineConfig({
  testDir: './e2e',
  testMatch: ['together.spec.ts', 'together-regressions.spec.ts'],
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  webServer: [
    {
      command: 'node scripts/together/preview-server.mjs',
      url: `${previewOrigin}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${e2ePort}`,
      url: `${e2eOrigin}/together-preview`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        THREADLINE_TOGETHER_PREVIEW: 'true',
        NEXT_PUBLIC_SUPABASE_URL: previewOrigin,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_together_preview',
        NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: 'true',
      },
    },
  ],
  use: {
    baseURL: e2eOrigin,
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
