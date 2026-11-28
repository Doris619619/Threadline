/** @fileoverview 在真实 PostgreSQL 引擎执行备忘录迁移，验证 RLS、RPC 权限与并发版本保护。 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('备忘录按账号隔离、禁止直接写入，陈旧版本和无效文档不能覆盖已保存内容', async () => {
  const database = new PGlite();
  const alice = '00000000-0000-4000-8000-000000000001';
  const bob = '00000000-0000-4000-8000-000000000002';
  const content = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
  try {
    await database.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
    for (const migration of [
      '202611280001_day_memos.sql',
      '202611280002_memo_conflict_response.sql',
    ]) {
      await database.exec(
        readFileSync(
          resolve(import.meta.dirname, '../supabase/migrations', migration),
          'utf8',
        ),
      );
    }
    await database.query('insert into auth.users(id) values ($1), ($2)', [alice, bob]);
    await database.exec('set role anon');
    await expect(
      database.query('select public.save_day_memo($1, $2, 0, $3)', [
        '2026-11-28',
        content,
        alice,
      ]),
    ).rejects.toThrow('permission denied');
    await database.exec('set role authenticated');
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [
      alice,
    ]);
    const first = await database.query<{ revision: number }>(
      'select revision from public.save_day_memo($1, $2, 0, $3)',
      ['2026-11-28', content, alice],
    );
    expect(Number(first.rows[0].revision)).toBe(1);
    await expect(
      database.query('select public.save_day_memo($1, $2, 0, $3)', [
        '2026-11-28',
        content,
        alice,
      ]),
    ).rejects.toMatchObject({ code: 'PT409', message: 'MEMO_CONFLICT' });
    await expect(
      database.query('update public.day_memos set revision = 99'),
    ).rejects.toThrow('permission denied');
    await database.query('select public.save_day_memo($1, $2, 1, $3)', [
      '2026-11-28',
      content,
      alice,
    ]);
    await expect(
      database.query('select public.save_day_memo($1, $2, 1, $3)', [
        '2026-11-28',
        content,
        alice,
      ]),
    ).rejects.toMatchObject({ code: 'PT409', message: 'MEMO_CONFLICT' });
    await expect(
      database.query('select public.save_day_memo($1, $2, 2, $3)', [
        '2026-11-28',
        '{}',
        alice,
      ]),
    ).rejects.toThrow('check constraint');
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [
      bob,
    ]);
    expect((await database.query('select * from public.day_memos')).rows).toHaveLength(
      0,
    );
    // 账号切到 Bob 后，Alice 尚未完成的首次写入不能创建到 Bob 名下。
    await expect(
      database.query('select public.save_day_memo($1, $2, 0, $3)', [
        '2026-11-28',
        content,
        alice,
      ]),
    ).rejects.toThrow('MEMO_ACCOUNT_CHANGED');
    await database.query('select public.save_day_memo($1, $2, 0, $3)', [
      '2026-11-28',
      content,
      bob,
    ]);
    // 即使新账号有同日期、同版本记录，旧账号的排队更新也不能覆盖它。
    await expect(
      database.query('select public.save_day_memo($1, $2, 1, $3)', [
        '2026-11-28',
        content,
        alice,
      ]),
    ).rejects.toThrow('MEMO_ACCOUNT_CHANGED');
    await database.query('select public.save_day_memo($1, $2, 0, $3)', [
      '2026-11-29',
      content,
      bob,
    ]);
    expect((await database.query('select * from public.day_memos')).rows).toHaveLength(
      2,
    );
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [
      alice,
    ]);
    expect((await database.query('select * from public.day_memos')).rows).toHaveLength(
      1,
    );
    await database.query("select set_config('request.jwt.claim.sub', '', false)");
    await expect(
      database.query('select public.save_day_memo($1, $2, 0, $3)', [
        '2026-11-30',
        content,
        alice,
      ]),
    ).rejects.toThrow('AUTH_REQUIRED');
  } finally {
    await database.close();
  }
}, 30_000);
