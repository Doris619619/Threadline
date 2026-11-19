/** @fileoverview 在隔离 Preview 上验证方案 A 的七个断点和 iPhone WebKit，不连接真实账号。 */
import { defineConfig, devices } from '@playwright/test';

const baseURL =
  process.env.THREADLINE_HIG_URL ??
  process.env.THREADLINE_PREVIEW_URL ??
  'http://127.0.0.1:3119';
const channel = process.env.THREADLINE_HIG_BROWSER_CHANNEL;
const authURL = process.env.THREADLINE_HIG_AUTH_URL ?? 'http://127.0.0.1:3120';
const authAddress = new URL(authURL);
if (
  authAddress.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost'].includes(authAddress.hostname)
)
  throw new Error('HIG authentication fixture must use loopback HTTP.');

/** 760/761 分别验证移动与桌面边界；宽度与真实触摸能力同时变化，避免只缩放桌面截图。 */
function chromiumProject(width: number) {
  const touch = width <= 760;
  return {
    name: `hig-${width}-chromium`,
    use: {
      ...devices['Desktop Chrome'],
      channel,
      viewport: { width, height: 900 },
      screen: { width, height: 900 },
      isMobile: touch,
      hasTouch: touch,
    },
  };
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/hig',
  testMatch: '**/ui-hig-*.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  use: {
    baseURL,
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  // 认证门禁不会挂载在 Preview 中，使用独立 dev 输出和假配置运行真实表单；所有请求由测试拦截。
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${authAddress.port || '80'}`,
    url: authURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      THREADLINE_TOGETHER_PREVIEW: 'true',
      VERCEL_ENV: 'development',
      ELECTRON_BUILD: '',
      NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: '',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3198',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_hig_local_fixture',
      NEXT_PUBLIC_THREADLINE_CLOUD_ENV: 'local',
    },
  },
  projects: [
    ...[320, 375, 390, 430, 760, 761, 1280].map(chromiumProject),
    {
      name: 'hig-iphone-webkit',
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
  ],
});
