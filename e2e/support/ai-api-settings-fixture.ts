/** @fileoverview 为真实 AI 设置组件建立仅由 Playwright 拦截提供的浏览器夹具，复用应用 CSS 并隔离账号与网络。 */
import { build } from 'esbuild';
import { expect, type Page } from '@playwright/test';

let bundle: Promise<string> | undefined;

/** 真实设置组件使用固定配置状态；只替换认证上下文依赖，不改变生产、演示或云端门禁。 */
function fixtureBundle(): Promise<string> {
  bundle ??= build({
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    stdin: {
      contents: `import { createRoot } from 'react-dom/client';
import { AiApiSettings } from './src/features/settings/ai-api-settings';
createRoot(document.getElementById('fixture')).render(<AiApiSettings />);`,
      loader: 'tsx',
      resolveDir: process.cwd(),
      sourcefile: 'ai-api-settings-fixture.tsx',
    },
    plugins: [
      {
        name: 'fixed-account-context',
        /** 将唯一认证上下文导入替换为内存夹具，函数调用只返回布尔状态且不发出 HTTP。 */
        setup(builder) {
          builder.onResolve({ filter: /\/cloud-runtime-provider$/ }, () => ({
            path: 'fixed-account-context',
            namespace: 'fixture',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: `const client = { functions: { invoke: async () => ({
  data: { configured: false, serverConfigured: false, canSave: true }, error: null
}) } };
export function useOptionalCloudRuntime() {
  return { client, user: { id: 'browser-fixture-owner' } };
}`,
            loader: 'js',
          }));
        },
      },
    ],
  }).then((result) => result.outputFiles[0].text);
  return bundle;
}

/** 从已启动的真实页面取得样式链接，在独立拦截页面挂载组件；所有资源继续来自同一开发服务。 */
export async function openAiApiSettingsFixture(page: Page) {
  await page.goto('/');
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  expect(styles.length).toBeGreaterThan(0);
  const script = await fixtureBundle();
  await page.route('**/__fixtures/ai-api-settings.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: script }),
  );
  await page.route('**/__fixtures/ai-api-settings', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="zh-CN" data-theme="blue" data-color-scheme="light"><head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
${styles.map((href) => `<link rel="stylesheet" href="${href}" />`).join('\n')}
</head><body><main id="fixture"></main><script src="/__fixtures/ai-api-settings.js"></script></body></html>`,
    }),
  );
  await page.goto('/__fixtures/ai-api-settings');
  await expect(page.getByLabel('DeepSeek API Key', { exact: true })).toBeVisible();
}
