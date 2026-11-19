/** @fileoverview 在显式本地开发适配器中回归导入确认的焦点与触屏尺寸，解析请求只使用测试拦截响应。 */
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.THREADLINE_SMART_IMPORT_PORT ?? '32221');
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('THREADLINE_SMART_IMPORT_PORT must be an integer from 1 to 65535.');
const baseURL = `http://127.0.0.1:${port}`;
const channel = process.env.THREADLINE_SMART_IMPORT_BROWSER_CHANNEL;

/** 手机边界与较宽触屏都使用 coarse pointer，防止只在最窄手机上扩大目标。 */
function touchProject(width: number) {
  return {
    name: `smart-import-touch-${width}`,
    use: {
      ...devices['Desktop Chrome'],
      channel,
      viewport: { width, height: 900 },
      screen: { width, height: 900 },
      hasTouch: true,
      isMobile: true,
    },
  };
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/ui-smart-import.spec.ts',
  outputDir: './test-results/smart-import',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: {
    baseURL,
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  ...(process.env.THREADLINE_EXTERNAL_TEST_SERVER === 'true'
    ? {}
    : {
        webServer: {
          command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: 'true',
            VERCEL_ENV: 'development',
            ELECTRON_BUILD: '',
          },
        },
      }),
  projects: [
    {
      name: 'smart-import-desktop',
      grep: /focus/,
      use: { ...devices['Desktop Chrome'], channel },
    },
    ...[760, 1024].map(touchProject),
  ],
});
