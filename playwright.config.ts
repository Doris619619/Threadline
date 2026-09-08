/**
 * @fileoverview 定义 Threadline 浏览器端到端测试项目，并始终创建隔离的 Next 测试服务器。
 */

import { defineConfig, devices } from '@playwright/test';

/** 解析测试服务器端口，允许并行的外部测试使用显式隔离端口。 */
const e2ePort = process.env.THREADLINE_E2E_PORT ?? '3100';

/** 统一 Playwright 页面访问地址与 webServer 健康检查地址。 */
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const usesExternalTestServer = process.env.THREADLINE_EXTERNAL_TEST_SERVER === 'true';

/** 默认 local adapter 项目跳过由专用配置负责的 UI 与真实 Supabase 测试。 */
const defaultWebTestIgnore = [
  '**/ui-*.spec.ts',
  '**/mobile-form-controls.spec.ts',
  '**/supabase-cloud.spec.ts',
];

/** 创建只收集紧凑布局矩阵文件的桌面项目，避免业务 E2E 被每个 viewport 重复执行。 */
function desktopLayoutProject(name: string, width: number, height: number) {
  return {
    name,
    testMatch: ['**/ui-layout-matrix.spec.ts', '**/ui-task-period.spec.ts'],
    use: {
      ...devices['Desktop Chrome'],
      channel: 'chrome',
      viewport: { width, height },
    },
  };
}

/** 创建使用真实移动设备语义、但保留指定 viewport 与 screen 尺寸的 Chrome 移动布局项目。 */
function mobileLayoutProject(name: string, width: number, height: number) {
  return {
    name,
    testMatch: ['**/ui-layout-matrix.spec.ts', '**/ui-task-period.spec.ts'],
    use: {
      ...devices['iPhone 13'],
      browserName: 'chromium',
      channel: 'chrome',
      viewport: { width, height },
      screen: { width, height },
    },
  };
}

/** 创建专用 iPhone WebKit 项目，验证会触发 Safari 自动缩放的表单字号前置条件。 */
function mobileFormControlsProject() {
  return {
    name: 'ui-mobile-form-controls',
    testMatch: '**/mobile-form-controls.spec.ts',
    use: { ...devices['iPhone 13'], browserName: 'webkit' },
  };
}

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
    {
      name: 'planning-webkit',
      testMatch: ['**/planning.spec.ts', '**/appearance.spec.ts'],
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
    {
      name: 'desktop',
      testIgnore: defaultWebTestIgnore,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'mobile',
      testIgnore: defaultWebTestIgnore,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'ui-structural',
      testMatch: '**/ui-structural.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'ui-accessibility',
      testMatch: '**/ui-accessibility.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
    desktopLayoutProject('ui-layout-desktop-1440', 1440, 900),
    desktopLayoutProject('ui-layout-desktop-1366', 1366, 768),
    desktopLayoutProject('ui-layout-desktop-1280', 1280, 720),
    desktopLayoutProject('ui-layout-desktop-1024', 1024, 768),
    mobileLayoutProject('ui-layout-mobile-430', 430, 932),
    mobileLayoutProject('ui-layout-mobile-390', 390, 844),
    mobileLayoutProject('ui-layout-mobile-375', 375, 667),
    mobileLayoutProject('ui-layout-mobile-320', 320, 568),
    mobileFormControlsProject(),
    {
      name: 'ui-layout-iphone-webkit',
      testMatch: ['**/ui-layout-matrix.spec.ts', '**/ui-task-period.spec.ts'],
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
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
