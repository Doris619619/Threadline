/** @fileoverview 验证账号 DeepSeek 密钥的加密隔离、设置 HTTP 合同、解析优先级与数据库最小权限，不访问真实服务。 */

import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  decryptAiKey,
  encryptAiKey,
  hasAiEncryptionKey,
  resolveAiApiKey,
  type AiCredentialStore,
  type EncryptedAiCredential,
} from '../supabase/functions/_shared/ai-credentials';
import {
  createAiSettingsHandler,
  type AiSettingsDependencies,
} from '../supabase/functions/ai-api-settings/handler';
import { createImportHandler } from '../supabase/functions/smart-task-import/handler';

const master = Buffer.alloc(32, 7).toString('base64');
const secondMaster = Buffer.alloc(32, 9).toString('base64');
const apiKey = 'sk-private-user-api-key-12345678';
const owner = '00000000-0000-4000-8000-000000000001';
const otherOwner = '00000000-0000-4000-8000-000000000002';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

/** 以内存存储记录每个真实身份的密文，同时暴露 spy 以检查操作没有使用请求体里的 owner。 */
function memoryStore() {
  const values = new Map<string, EncryptedAiCredential>();
  const store: AiCredentialStore = {
    read: vi.fn(async (id) => values.get(id) ?? null),
    save: vi.fn(async (id, value) => {
      values.set(id, value);
    }),
    delete: vi.fn(async (id) => {
      values.delete(id);
    }),
  };
  return { store, values };
}

/** 用生产合同构造设置请求；测试内容只使用虚构密钥。 */
function request(
  body: unknown = { action: 'status' },
  headers: Record<string, string> = {},
) {
  return new Request('https://example.supabase.co/functions/v1/ai-api-settings', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer signed-user-jwt',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** 创建已认证的服务依赖，不调用供应商 API 验证密钥。 */
function dependencies(overrides: Partial<AiSettingsDependencies> = {}) {
  return {
    authenticate: vi.fn(async () => owner),
    store: memoryStore().store,
    encryptionKey: master,
    serverApiKey: undefined,
    ...overrides,
  };
}

describe('账号凭据加密与选择', () => {
  it('只接受32字节base64主密钥，不接受普通口令或其他长度', () => {
    expect(hasAiEncryptionKey(master)).toBe(true);
    expect(hasAiEncryptionKey(undefined)).toBe(false);
    expect(hasAiEncryptionKey('password')).toBe(false);
    expect(hasAiEncryptionKey(Buffer.alloc(16).toString('base64'))).toBe(false);
  });

  it('相同密钥每次加密产生不同 IV 和密文，可按账号解密且持久化结构无明文', async () => {
    const first = await encryptAiKey(apiKey, owner, master);
    const second = await encryptAiKey(apiKey, owner, master);
    expect(first.iv).not.toBe(second.iv);
    expect(first.encrypted_key).not.toBe(second.encrypted_key);
    expect(await decryptAiKey(first, owner, master)).toBe(apiKey);
    expect(JSON.stringify(first)).not.toContain(apiKey);
    expect(first).toMatchObject({ provider: 'deepseek', version: 1 });
  });

  it('拒绝跨账号、错误主密钥、篡改密文及供应商，不在错误里包含密钥', async () => {
    const encrypted = await encryptAiKey(apiKey, owner, master);
    await expect(decryptAiKey(encrypted, otherOwner, master)).rejects.toThrow(
      'ai_credentials_unavailable',
    );
    await expect(decryptAiKey(encrypted, owner, secondMaster)).rejects.toThrow(
      'ai_credentials_unavailable',
    );
    await expect(
      decryptAiKey(
        { ...encrypted, encrypted_key: 'A'.repeat(encrypted.encrypted_key.length) },
        owner,
        master,
      ),
    ).rejects.toThrow('ai_credentials_unavailable');
    await expect(
      decryptAiKey({ ...encrypted, provider: 'other' as 'deepseek' }, owner, master),
    ).rejects.toThrow('ai_credentials_unavailable');
  });

  it('优先账号密钥，无账号记录才使用全局；未配置加密仍兼容全局模式', async () => {
    const { store, values } = memoryStore();
    const signal = new AbortController().signal;
    expect(
      await resolveAiApiKey(owner, signal, {
        store,
        encryptionKey: master,
        serverApiKey: 'global-key',
      }),
    ).toBe('global-key');
    values.set(owner, await encryptAiKey(apiKey, owner, master));
    expect(
      await resolveAiApiKey(owner, signal, {
        store,
        encryptionKey: master,
        serverApiKey: 'global-key',
      }),
    ).toBe(apiKey);
    expect(
      await resolveAiApiKey(otherOwner, signal, {
        store,
        encryptionKey: master,
        serverApiKey: 'global-key',
      }),
    ).toBe('global-key');
    await expect(
      resolveAiApiKey(owner, signal, { store, serverApiKey: 'global-key' }),
    ).rejects.toThrow('ai_credentials_unavailable');
    expect(
      await resolveAiApiKey(otherOwner, signal, { store, serverApiKey: 'global-key' }),
    ).toBe('global-key');
    expect(await resolveAiApiKey(owner, signal, {})).toBeUndefined();
  });

  it('已保存密文损坏时拒绝静默回退另一份全局额度', async () => {
    const { store, values } = memoryStore();
    values.set(owner, await encryptAiKey(apiKey, owner, master));
    await expect(
      resolveAiApiKey(owner, new AbortController().signal, {
        store,
        encryptionKey: secondMaster,
        serverApiKey: 'global-key',
      }),
    ).rejects.toThrow('ai_credentials_unavailable');
  });
});

describe('API 设置 HTTP 边界', () => {
  it('status/save/delete 只返回三个布尔值，保存数据只有密文且删除真正清除当前账号', async () => {
    const { store, values } = memoryStore();
    const handler = createAiSettingsHandler(
      dependencies({ store, serverApiKey: 'global-key' }),
    );
    const initial = await handler(request());
    expect(initial.headers.get('Cache-Control')).toBe('no-store');
    expect(await initial.json()).toEqual({
      configured: false,
      serverConfigured: true,
      canSave: true,
    });
    const saved = await handler(request({ action: 'save', apiKey }));
    expect(await saved.json()).toEqual({
      configured: true,
      serverConfigured: true,
      canSave: true,
    });
    const stored = values.get(owner)!;
    expect(JSON.stringify(stored)).not.toContain(apiKey);
    expect(await decryptAiKey(stored, owner, master)).toBe(apiKey);
    expect(await (await handler(request())).json()).toEqual({
      configured: true,
      serverConfigured: true,
      canSave: true,
    });
    const deleted = await handler(request({ action: 'delete' }));
    expect(await deleted.json()).toEqual({
      configured: false,
      serverConfigured: true,
      canSave: true,
    });
    expect(values.has(owner)).toBe(false);
    expect(store.save).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ provider: 'deepseek' }),
      expect.any(AbortSignal),
    );
    expect(store.delete).toHaveBeenCalledWith(owner, expect.any(AbortSignal));
  });

  it('其他账号保存凭据不影响当前账号状态，也不能通过请求体选择owner', async () => {
    const { store, values } = memoryStore();
    values.set(otherOwner, await encryptAiKey(apiKey, otherOwner, master));
    const handler = createAiSettingsHandler(dependencies({ store }));
    expect(await (await handler(request())).json()).toEqual({
      configured: false,
      serverConfigured: false,
      canSave: true,
    });
    expect(
      (await handler(request({ action: 'delete', owner: otherOwner }))).status,
    ).toBe(400);
    await handler(request({ action: 'delete' }));
    expect(values.has(otherOwner)).toBe(true);
  });

  it('预检支持 Electron，非POST、缺少/失效认证不能访问存储', async () => {
    const deps = dependencies();
    const handler = createAiSettingsHandler(deps);
    const preflight = await handler(
      new Request('https://example.test', {
        method: 'OPTIONS',
        headers: { Origin: 'threadline://app' },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect((await handler(new Request('https://example.test'))).status).toBe(405);
    expect((await handler(request({}, { Authorization: '' }))).status).toBe(401);
    const invalid = createAiSettingsHandler({
      ...deps,
      authenticate: vi.fn(async () => null),
    });
    expect((await invalid(request())).status).toBe(401);
    expect(deps.store.read).not.toHaveBeenCalled();
  });

  it('无主密钥时状态不宣称能保存，但仍可删除已经保存的凭据', async () => {
    const { store, values } = memoryStore();
    values.set(owner, await encryptAiKey(apiKey, owner, master));
    const handler = createAiSettingsHandler(
      dependencies({ store, encryptionKey: undefined }),
    );
    expect(await (await handler(request())).json()).toEqual({
      configured: true,
      serverConfigured: false,
      canSave: false,
    });
    expect((await handler(request({ action: 'save', apiKey }))).status).toBe(503);
    expect((await handler(request({ action: 'delete' }))).status).toBe(200);
    expect(values.has(owner)).toBe(false);
  });

  it('无管理环境时保持可读配置状态且禁止保存', async () => {
    const handler = createAiSettingsHandler(dependencies({ store: undefined }));
    expect(await (await handler(request())).json()).toEqual({
      configured: false,
      serverConfigured: false,
      canSave: false,
    });
    expect((await handler(request({ action: 'save', apiKey }))).status).toBe(503);
    expect((await handler(request({ action: 'delete' }))).status).toBe(503);
  });

  it('不臆测供应商密钥前缀，只检查长度和控制字符', async () => {
    const handler = createAiSettingsHandler(dependencies());
    expect(
      (
        await handler(
          request({ action: 'save', apiKey: 'future-deepseek-token_123456789' }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await handler(request({ action: 'save', apiKey: 'x'.repeat(513) }))).status,
    ).toBe(400);
    expect(
      (await handler(request({ action: 'save', apiKey: 'secret\nwith-linebreak' })))
        .status,
    ).toBe(400);
  });

  it.each([
    { action: 'save', apiKey: '' },
    { action: 'save', apiKey: 'plain password' },
    { action: 'save', apiKey: 'sk-too short' },
    { action: 'unknown' },
    { action: ['status'] },
    { action: 'save', apiKey, provider: 'other' },
  ])('拒绝无效操作或密钥 %#', async (body) => {
    const deps = dependencies();
    const result = await createAiSettingsHandler(deps)(request(body));
    expect(result.status).toBe(400);
    expect(await result.text()).not.toContain(apiKey);
    expect(deps.store.save).not.toHaveBeenCalled();
  });

  it('存储失败的错误不回传用户key、主密钥或后端诊断', async () => {
    const { store } = memoryStore();
    const handler = createAiSettingsHandler(
      dependencies({
        store: {
          ...store,
          save: vi.fn(async () => {
            throw new Error(`private ${apiKey} ${master}`);
          }),
        },
      }),
    );
    const result = await handler(request({ action: 'save', apiKey }));
    expect(result.status).toBe(503);
    const body = await result.text();
    expect(body).not.toContain(apiKey);
    expect(body).not.toContain(master);
    expect(body).not.toContain('private');
  });

  it('读取存储失败不把已有设置伪装成未配置', async () => {
    const { store } = memoryStore();
    const handler = createAiSettingsHandler(
      dependencies({
        store: {
          ...store,
          read: vi.fn(async () => {
            throw new Error('private db diagnostic');
          }),
        },
      }),
    );
    const result = await handler(request());
    expect(result.status).toBe(503);
    expect(await result.json()).not.toHaveProperty('configured');
  });

  it('解析端点调用已认证owner的密钥解析器，使用账号key且不回传', async () => {
    const { store, values } = memoryStore();
    values.set(owner, await encryptAiKey(apiKey, owner, master));
    const modelFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: '{"tasks":[]}' } }],
          }),
        ),
    );
    const resolve = vi.fn((id: string, signal: AbortSignal) =>
      resolveAiApiKey(id, signal, {
        store,
        encryptionKey: master,
        serverApiKey: 'global-key',
      }),
    );
    const handler = createImportHandler({
      authenticate: vi.fn(async () => owner),
      resolveApiKey: resolve,
      listProjects: vi.fn(async () => [
        { id: 'fallback', name: '其他', isFallback: true },
      ]),
      fetch: modelFetch,
    });
    const result = await handler(request({ text: '请完成作业' }));
    expect(result.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith(owner, expect.any(AbortSignal));
    const init = (modelFetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${apiKey}` });
    expect(await result.text()).not.toContain(apiKey);
  });

  it('解析无账号及全局密钥时引导设置，解密故障为安全503', async () => {
    const base = {
      authenticate: vi.fn(async () => owner),
      listProjects: vi.fn(async () => [
        { id: 'fallback', name: '其他', isFallback: true },
      ]),
      fetch: vi.fn(),
    };
    const missing = await createImportHandler({
      ...base,
      resolveApiKey: vi.fn(async () => undefined),
    })(request({ text: '完成作业' }));
    expect(missing.status).toBe(503);
    expect(await missing.text()).toContain('AI / API 接入');
    const { store, values } = memoryStore();
    values.set(owner, await encryptAiKey(apiKey, owner, master));
    const broken = await createImportHandler({
      ...base,
      resolveApiKey: (id, signal) =>
        resolveAiApiKey(id, signal, { store, encryptionKey: secondMaster }),
    })(request({ text: '完成作业' }));
    expect(broken.status).toBe(503);
    expect(await broken.text()).not.toContain(apiKey);
    expect(base.fetch).not.toHaveBeenCalled();
  });
});

describe('账号凭据表本地权限', () => {
  it('真实执行迁移后anon/authenticated均无直接读写权限，service_role可读写且表启用RLS', async () => {
    const database = new PGlite();
    try {
      await database.exec(
        'create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);',
      );
      await database.exec(
        readFileSync(
          resolve(
            import.meta.dirname,
            '../supabase/migrations/202611190001_account_ai_credentials.sql',
          ),
          'utf8',
        ),
      );
      const privileges = await database.query<{
        role: string;
        privilege: string;
        allowed: boolean;
      }>(
        `select role, privilege, has_table_privilege(role, 'public.account_ai_credentials', privilege) as allowed from (values ('anon'), ('authenticated'), ('service_role')) as roles(role) cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) as privileges(privilege)`,
      );
      expect(
        privileges.rows
          .filter((row) => row.role !== 'service_role')
          .every((row) => !row.allowed),
      ).toBe(true);
      expect(
        privileges.rows
          .filter((row) => row.role === 'service_role')
          .every((row) => row.allowed),
      ).toBe(true);
      const rls = await database.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where oid = 'public.account_ai_credentials'::regclass",
      );
      expect(rls.rows[0].relrowsecurity).toBe(true);
      await database.exec('set role authenticated');
      await expect(
        database.query('select * from public.account_ai_credentials'),
      ).rejects.toThrow('permission denied');
      await database.exec('reset role');
      await database.query('insert into auth.users(id) values ($1)', [owner]);
      const encrypted = await encryptAiKey(apiKey, owner, master);
      await database.exec('set role service_role');
      await database.query(
        'insert into public.account_ai_credentials(owner_id,encrypted_key,iv) values ($1,$2,$3)',
        [owner, encrypted.encrypted_key, encrypted.iv],
      );
      expect(
        (
          await database.query(
            'select encrypted_key from public.account_ai_credentials',
          )
        ).rows,
      ).toHaveLength(1);
      await database.query(
        'delete from public.account_ai_credentials where owner_id = $1',
        [owner],
      );
      expect(
        (await database.query('select * from public.account_ai_credentials')).rows,
      ).toHaveLength(0);
    } finally {
      await database.close();
    }
  }, 30_000);
});
