/** @fileoverview 验证发布命令拒绝本机、错误 tag、缺少凭据和测试配置，不访问 GitHub。 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { validateRelease } from '../scripts/publish-desktop.mjs';
import manifest from '../package.json';
beforeEach(() => {
  vi.stubEnv('GITHUB_ACTIONS', 'true');
  vi.stubEnv('GITHUB_REPOSITORY', 'Doris619619/Threadline');
  vi.stubEnv('GITHUB_REF', `refs/tags/v${manifest.version}`);
  vi.stubEnv('GH_TOKEN', 'test-only');
  vi.stubEnv('NEXT_PUBLIC_THREADLINE_CLOUD_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_THREADLINE_TEST_ADAPTER', 'false');
});
afterEach(() => vi.unstubAllEnvs());
it('accepts matching stable tag for preflight only', async () => {
  await expect(validateRelease()).resolves.toBe(manifest.version);
});
it.each([
  ['GITHUB_ACTIONS', 'false'],
  ['GITHUB_REF', 'refs/heads/main'],
  ['GH_TOKEN', ''],
  ['NEXT_PUBLIC_THREADLINE_TEST_ADAPTER', 'true'],
])('rejects %s=%s', async (key, value) => {
  vi.stubEnv(key, value);
  await expect(validateRelease()).rejects.toThrow();
});
