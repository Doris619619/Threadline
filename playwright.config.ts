/**
 * @fileoverview 定义 Threadline 浏览器端到端测试项目，并始终创建隔离的 Next 测试服务器。
 */

import { defineConfig, devices } from '@playwright/test';

/** 解析测试服务器端口，允许并行的外部测试使用显式隔离端口。 */
const e2ePort = process.env.THREADLINE_E2E_PORT ?? '3100';

/** 统一 Playwright 页面访问地址与 webServer 健康检查地址。 */
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const usesExternalTestServer = process.env.THREADLINE_EXTERNAL_TEST_SERVER === 'true';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // 业务状态使用同一 origin 的 localStorage；跨用例并行会互相清空或覆盖持久化数据。
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: e2eBaseUrl,
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    // 生产构建后 service worker 可能缓存已替换的 chunk；E2E 应只验证当前构建产物。
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  ...(usesExternalTestServer
    ? {}
    : {
        webServer: {
          command: `node node_modules/next/dist/bin/next start --port ${e2ePort}`,
          url: e2eBaseUrl,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
});
