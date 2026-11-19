/** @fileoverview 用虚构环境与拦截 HTTP 验证 AI Edge 的平台密钥选择、用户认证和管理凭据边界，不读取本机凭据或访问真实服务。 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

type AiRuntime = typeof import('../supabase/functions/_shared/supabase');
let runtime: AiRuntime;
let environment: Record<string, string>;
let requests: { url: string; headers: Headers }[];

/** 只转译实际 Edge 模块并桥接 npm: 说明符，保留其完整生产逻辑与已安装 SDK。 */
beforeAll(async () => {
  // 仅把 Deno 的 npm: 说明符接到项目已安装的同版 SDK，生产模块和实际 HTTP 客户端保持原实现。
  const sdk = pathToFileURL(
    createRequire(import.meta.url).resolve('@supabase/supabase-js'),
  ).href;
  const compiled = transpileModule(
    readFileSync(resolve('supabase/functions/_shared/supabase.ts'), 'utf8'),
    { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } },
  ).outputText.replace(
    /from ['"]npm:@supabase\/supabase-js@[^'"]+['"]/,
    `from ${JSON.stringify(sdk)}`,
  );
  const source = `data:text/javascript;base64,${Buffer.from(`${compiled}\n//# sourceURL=threadline-ai-supabase-runtime.mjs`).toString('base64')}`;
  runtime = await import(/* @vite-ignore */ source);
});

/** 每例只暴露合成 Deno 环境，所有实际 SDK HTTP 请求都由内存响应截获。 */
beforeEach(() => {
  environment = { SUPABASE_URL: 'https://fixture.supabase.co' };
  requests = [];
  vi.stubGlobal('Deno', { env: { get: (name: string) => environment[name] } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    }),
  );
});

/** 恢复全局 fetch 和 Deno 替身，不向后续测试遗留环境。 */
afterEach(() => vi.unstubAllGlobals());

it('uses the platform publishable default while preserving the user JWT for RLS', async () => {
  environment.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({
    default: 'sb_publishable_fixture',
  });
  environment.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_single';
  environment.SUPABASE_ANON_KEY = 'legacy-anon-fixture';
  const { error } = await runtime
    .userClient('Bearer fixture-user-jwt', new AbortController().signal)
    .from('projects')
    .select('id');
  expect(error).toBeNull();
  expect(requests).toHaveLength(1);
  expect(requests[0].headers.get('apikey')).toBe('sb_publishable_fixture');
  expect(requests[0].headers.get('Authorization')).toBe('Bearer fixture-user-jwt');
});

it('uses the platform secret default only for the owner-filtered credential store', async () => {
  environment.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({
    default: 'sb_publishable_fixture',
  });
  environment.SUPABASE_SECRET_KEYS = JSON.stringify({ default: 'sb_secret_fixture' });
  environment.SUPABASE_SECRET_KEY = 'sb_secret_single';
  environment.SUPABASE_SERVICE_ROLE_KEY = 'legacy-service-role-fixture';
  const store = runtime.createAiCredentialStore();
  expect(store).toBeDefined();
  await store!.delete('fixture-owner', new AbortController().signal);
  expect(requests).toHaveLength(1);
  expect(requests[0].headers.get('apikey')).toBe('sb_secret_fixture');
  expect(new URL(requests[0].url).pathname).toBe('/rest/v1/account_ai_credentials');
  expect(new URL(requests[0].url).searchParams.get('owner_id')).toBe(
    'eq.fixture-owner',
  );
});

it.each([
  {
    name: 'single',
    publicName: 'SUPABASE_PUBLISHABLE_KEY',
    publicKey: 'sb_publishable_single',
    secretName: 'SUPABASE_SECRET_KEY',
    secretKey: 'sb_secret_single',
  },
  {
    name: 'legacy',
    publicName: 'SUPABASE_ANON_KEY',
    publicKey: 'legacy-anon-fixture',
    secretName: 'SUPABASE_SERVICE_ROLE_KEY',
    secretKey: 'legacy-service-role-fixture',
  },
])(
  'preserves the $name environment fallback for both permission scopes',
  async (keys) => {
    environment[keys.publicName] = keys.publicKey;
    environment[keys.secretName] = keys.secretKey;
    const { error } = await runtime
      .userClient('Bearer fixture-user-jwt', new AbortController().signal)
      .from('projects')
      .select('id');
    expect(error).toBeNull();
    await runtime
      .createAiCredentialStore()!
      .delete('fixture-owner', new AbortController().signal);
    expect(requests.map((request) => request.headers.get('apikey'))).toEqual([
      keys.publicKey,
      keys.secretKey,
    ]);
    expect(requests[0].headers.get('Authorization')).toBe('Bearer fixture-user-jwt');
  },
);

const invalidDictionaries = [
  { name: 'missing', value: undefined },
  { name: 'empty', value: '' },
  { name: 'malformed JSON', value: '{' },
  { name: 'null', value: 'null' },
  { name: 'array', value: '[]' },
  { name: 'primitive', value: '"not-a-dictionary"' },
  { name: 'no default', value: '{"another":"unused-key"}' },
  { name: 'null default', value: '{"default":null}' },
  { name: 'non-string default', value: '{"default":42}' },
  { name: 'blank default', value: '{"default":"  "}' },
  { name: 'invalid default key', value: '{"default":"not-an-api-key"}' },
];

it.each(invalidDictionaries)(
  'falls back from a $name dictionary without guessing a named key',
  async ({ value }) => {
    if (value !== undefined) {
      environment.SUPABASE_PUBLISHABLE_KEYS = value;
      environment.SUPABASE_SECRET_KEYS = value;
    }
    environment.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_single';
    environment.SUPABASE_ANON_KEY = 'legacy-anon-fixture';
    environment.SUPABASE_SECRET_KEY = 'sb_secret_single';
    environment.SUPABASE_SERVICE_ROLE_KEY = 'legacy-service-role-fixture';
    await runtime
      .userClient('Bearer fixture-user-jwt', new AbortController().signal)
      .from('projects')
      .select('id');
    await runtime
      .createAiCredentialStore()!
      .delete('fixture-owner', new AbortController().signal);
    expect(requests.map((request) => request.headers.get('apikey'))).toEqual([
      'sb_publishable_single',
      'sb_secret_single',
    ]);
  },
);

it.each(invalidDictionaries)(
  'fails closed for a $name dictionary when no compatible fallback exists',
  ({ value }) => {
    if (value !== undefined) {
      environment.SUPABASE_PUBLISHABLE_KEYS = value;
      environment.SUPABASE_SECRET_KEYS = value;
    }
    expect(() =>
      runtime.userClient('Bearer fixture-user-jwt', new AbortController().signal),
    ).toThrow('missing_supabase_configuration');
    expect(runtime.createAiCredentialStore()).toBeUndefined();
    expect(requests).toEqual([]);
  },
);

it('never uses a publishable key for credentials or a secret key for user RLS', () => {
  environment.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({
    default: 'sb_secret_wrong_scope',
  });
  environment.SUPABASE_SECRET_KEYS = JSON.stringify({
    default: 'sb_publishable_wrong_scope',
  });
  environment.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_wrong_scope';
  environment.SUPABASE_ANON_KEY = 'sb_secret_wrong_scope';
  environment.SUPABASE_SECRET_KEY = 'sb_publishable_wrong_scope';
  environment.SUPABASE_SERVICE_ROLE_KEY = 'sb_publishable_wrong_scope';
  expect(() =>
    runtime.userClient('Bearer fixture-user-jwt', new AbortController().signal),
  ).toThrow('missing_supabase_configuration');
  expect(runtime.createAiCredentialStore()).toBeUndefined();
  expect(requests).toEqual([]);
});

it('does not select another named key without a default', () => {
  environment.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({
    custom: 'sb_publishable_custom',
  });
  environment.SUPABASE_SECRET_KEYS = JSON.stringify({ custom: 'sb_secret_custom' });
  expect(() =>
    runtime.userClient('Bearer fixture-user-jwt', new AbortController().signal),
  ).toThrow('missing_supabase_configuration');
  expect(runtime.createAiCredentialStore()).toBeUndefined();
});

it('takes the authenticated owner from Auth rather than the unverified bearer text', async () => {
  environment.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({
    default: 'sb_publishable_fixture',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response(
        JSON.stringify({ id: 'verified-owner', aud: 'authenticated' }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
  expect(
    await runtime.authenticateAiUser(
      'Bearer fixture-user-jwt',
      new AbortController().signal,
    ),
  ).toBe('verified-owner');
  expect(new URL(requests[0].url).pathname).toBe('/auth/v1/user');
  expect(requests[0].headers.get('Authorization')).toBe('Bearer fixture-user-jwt');
  expect(requests[0].headers.get('apikey')).toBe('sb_publishable_fixture');
});

it('rejects a bearer rejected by Auth even when a publishable default is present', async () => {
  environment.SUPABASE_PUBLISHABLE_KEYS = JSON.stringify({
    default: 'sb_publishable_fixture',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'Invalid JWT' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
  expect(
    await runtime.authenticateAiUser(
      'Bearer fixture-user-jwt',
      new AbortController().signal,
    ),
  ).toBeNull();
});
