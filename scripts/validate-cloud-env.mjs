/**
 * @fileoverview 在 Web/Vercel 与 Electron 构建前校验公开 Supabase 配置和 Preview 隔离策略。
 */

const [mode = 'web'] = process.argv.slice(2);
if (!['web', 'electron', 'electron-production'].includes(mode))
  throw new Error('Usage: validate-cloud-env.mjs <web|electron|electron-production>');

const testAdapter = process.env.NEXT_PUBLIC_THREADLINE_TEST_ADAPTER === 'true';
const vercelEnvironment = process.env.VERCEL_ENV;
const cloudEnvironment = process.env.NEXT_PUBLIC_THREADLINE_CLOUD_ENV;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

/** 拒绝 secret/service role，并要求当前 Supabase publishable key 格式。 */
function validatePublishableKey(value) {
  if (!value.startsWith('sb_publishable_'))
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must use the sb_publishable_ key, not a legacy anon or secret key.',
    );
  if (/service_role|sb_secret_/i.test(value))
    throw new Error(
      'A Supabase secret/service role key must never enter the renderer.',
    );
}

/** 只把 Supabase CLI 的 loopback HTTP 视为本地开发地址。 */
function isLoopbackHttp(parsed) {
  return (
    parsed.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
  );
}

if (testAdapter) {
  if (vercelEnvironment)
    throw new Error('The local test adapter is forbidden on every Vercel deployment.');
  console.log(`Cloud env validation: explicit ${mode} test adapter.`);
  process.exit(0);
}

if (Boolean(url) !== Boolean(publishableKey))
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be configured together.',
  );

if (url && publishableKey) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !isLoopbackHttp(parsed))
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL must use HTTPS; only loopback HTTP is allowed for local development.',
    );
  if (
    (vercelEnvironment || mode === 'electron-production') &&
    parsed.protocol !== 'https:'
  )
    throw new Error('Vercel and Electron production require an HTTPS Supabase URL.');
  validatePublishableKey(publishableKey);
}

if (vercelEnvironment === 'production') {
  if (!url || !publishableKey)
    throw new Error('Vercel Production requires Production Supabase configuration.');
  if (cloudEnvironment !== 'production')
    throw new Error(
      'Vercel Production requires NEXT_PUBLIC_THREADLINE_CLOUD_ENV=production.',
    );
}

if (vercelEnvironment === 'preview' && url) {
  if (cloudEnvironment !== 'staging' && cloudEnvironment !== 'test')
    throw new Error(
      'Configured Vercel Preview must declare staging/test cloud environment and must not use Production Supabase.',
    );
}

if (mode === 'electron-production') {
  if (!url || !publishableKey)
    throw new Error('Electron production packaging requires Supabase configuration.');
  if (cloudEnvironment !== 'production')
    throw new Error(
      'Electron production packaging requires NEXT_PUBLIC_THREADLINE_CLOUD_ENV=production.',
    );
}

console.log(
  url
    ? `Cloud env validation passed for ${mode} (${cloudEnvironment ?? 'local'}).`
    : vercelEnvironment === 'preview' && mode === 'web'
      ? 'Cloud env validation passed for web: isolated browser demo (no Supabase).'
      : `Cloud env validation passed for ${mode}: intentional unconfigured UI.`,
);
