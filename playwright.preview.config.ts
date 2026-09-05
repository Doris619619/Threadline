/** @fileoverview 针对真实 Preview 演示构建或已部署 URL 验证桌面和手机交互。 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/ui-preview-demo.spec.ts',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: process.env.THREADLINE_PREVIEW_URL ?? 'http://127.0.0.1:3103',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'preview-desktop',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'preview-mobile-320',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 320, height: 740 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'preview-iphone-webkit',
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
  ],
});
