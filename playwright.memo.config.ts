/** @fileoverview 在隔离本地适配器中验证每日备忘录的真实粘贴、恢复、主题和手机布局。 */
import { defineConfig, devices } from '@playwright/test';

const port = 32228;
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/ui-memo.spec.ts',
  outputDir: './test-results/memo',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: 'true',
      VERCEL_ENV: 'development',
      ELECTRON_BUILD: '',
      THREADLINE_TOGETHER_PREVIEW: '',
    },
  },
  projects: [
    {
      name: 'memo-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        channel: process.env.THREADLINE_MEMO_BROWSER_CHANNEL,
      },
    },
    { name: 'memo-iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
});
