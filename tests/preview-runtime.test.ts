/** @fileoverview 验证 Preview 演示开关不会泄露到生产，并与旧浏览器数据隔离。 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageStateRepository } from '@/lib/repository';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  localStorage.clear();
});

describe('preview demo deployment boundary', () => {
  it.each([
    ['preview', '', '', '', 'true'],
    ['production', '', '', '', 'false'],
    ['', '', '', '', 'false'],
    ['preview', 'https://staging.supabase.co', 'sb_publishable_example', '', 'false'],
    ['preview', 'https://staging.supabase.co', '', '', 'false'],
    ['preview', '', 'sb_publishable_example', '', 'false'],
    ['preview', '', '', 'true', 'false'],
  ])(
    'derives the mode for %s with URL=%s, key=%s, Electron=%s',
    async (environment, url, key, electron, expected) => {
      vi.stubEnv('VERCEL_ENV', environment);
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url);
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', key);
      vi.stubEnv('ELECTRON_BUILD', electron);
      vi.stubEnv('NEXT_PUBLIC_THREADLINE_PREVIEW_DEMO', 'true');
      const { default: config } = await import('../next.config');
      expect(config.env?.NEXT_PUBLIC_THREADLINE_PREVIEW_DEMO).toBe(expected);
    },
  );

  it('does not read, overwrite or remove legacy task data in demo mode', async () => {
    const key = 'threadline.tasks.v1';
    localStorage.setItem(key, JSON.stringify(['legacy-private-task']));
    vi.stubEnv('NEXT_PUBLIC_THREADLINE_PREVIEW_DEMO', 'true');
    const repository = new LocalStorageStateRepository();
    expect(await repository.read(key)).toBeUndefined();
    await repository.write(key, ['demo-task']);
    expect(await repository.read(key)).toEqual(['demo-task']);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['legacy-private-task']);
    await repository.remove(key);
    expect(await repository.read(key)).toBeUndefined();
    vi.stubEnv('NEXT_PUBLIC_THREADLINE_PREVIEW_DEMO', 'false');
    expect(await repository.read(key)).toEqual(['legacy-private-task']);
  });
});
