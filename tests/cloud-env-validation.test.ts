/** @fileoverview 验证 Vercel Preview、Production 与 Electron 的 Supabase 构建门禁。 */

import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const publishableKey = `sb_publishable_${'a'.repeat(32)}`;

/** 用隔离 env 执行真实构建校验脚本，并返回退出状态和错误输出。 */
function validate(
  mode: 'web' | 'electron' | 'electron-production',
  values: Record<string, string>,
) {
  return spawnSync(process.execPath, ['scripts/validate-cloud-env.mjs', mode], {
    encoding: 'utf8',
    env: {
      ...process.env,
      VERCEL_ENV: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      NEXT_PUBLIC_THREADLINE_CLOUD_ENV: '',
      NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: '',
      ...values,
    },
  });
}

describe('cloud build environment gate', () => {
  it('allows a browser demo for Vercel Preview without Supabase', () => {
    const result = validate('web', { VERCEL_ENV: 'preview' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('isolated browser demo');
  });

  it('rejects partial cloud configuration instead of falling back to demo', () => {
    expect(
      validate('web', {
        VERCEL_ENV: 'preview',
        NEXT_PUBLIC_SUPABASE_URL: 'https://staging.supabase.co',
      }).status,
    ).toBe(1);
  });

  it('keeps the explicit test adapter forbidden on Vercel', () => {
    expect(
      validate('web', {
        VERCEL_ENV: 'preview',
        NEXT_PUBLIC_THREADLINE_TEST_ADAPTER: 'true',
      }).status,
    ).toBe(1);
  });

  it('rejects Production Supabase semantics in a Vercel Preview', () => {
    const result = validate('web', {
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_SUPABASE_URL: 'https://production.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      NEXT_PUBLIC_THREADLINE_CLOUD_ENV: 'production',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must not use Production Supabase');
  });

  it('rejects a Vercel Production build without cloud config', () => {
    expect(validate('web', { VERCEL_ENV: 'production' }).status).toBe(1);
  });

  it('accepts explicit Production Supabase for Electron packaging', () => {
    expect(
      validate('electron-production', {
        NEXT_PUBLIC_SUPABASE_URL: 'https://production.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
        NEXT_PUBLIC_THREADLINE_CLOUD_ENV: 'production',
      }).status,
    ).toBe(0);
  });

  it('allows loopback HTTP only for local development', () => {
    expect(
      validate('electron', {
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
        NEXT_PUBLIC_THREADLINE_CLOUD_ENV: 'test',
      }).status,
    ).toBe(0);
    expect(
      validate('web', {
        NEXT_PUBLIC_SUPABASE_URL: 'http://remote.example.test',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      }).status,
    ).toBe(1);
    expect(
      validate('web', {
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
        NEXT_PUBLIC_THREADLINE_CLOUD_ENV: 'production',
      }).status,
    ).toBe(1);
  });
});
