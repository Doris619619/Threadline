/**
 * @fileoverview 定义只运行真实本地 Supabase 浏览器集成测试的独立 Playwright 项目。
 */

import { defineConfig, devices } from '@playwright/test';

/** 读取与本地 Supabase browser runner 对应的隔离 Next 服务端口。 */
const supabaseE2ePort = process.env.THREADLINE_SUPABASE_E2E_PORT ?? '3101';

/** 统一浏览器访问与 runner 健康检查使用的 loopback origin。 */
const supabaseE2eBaseUrl = `http://127.0.0.1:${supabaseE2ePort}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'supabase-cloud.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: supabaseE2eBaseUrl,
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    // 集成链路验证当前构建与云运行时，而非先前 Web E2E 的 service worker 缓存。
    serviceWorkers: 'block',
  },
});
