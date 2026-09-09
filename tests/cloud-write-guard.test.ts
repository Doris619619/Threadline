/** @fileoverview 验证排队写入阻止更新、失败释放与更新锁拒绝新写入。 */
import { afterEach, expect, it, vi } from 'vitest';
import {
  beginCloudWrite,
  getPendingCloudWrites,
  lockForDesktopUpdate,
  trackedCloudFetch,
} from '@/lib/cloud-write-guard';
afterEach(() => vi.unstubAllGlobals());
it('holds queued writes and releases idempotently', () => {
  const end = beginCloudWrite();
  expect(() => lockForDesktopUpdate()).toThrow('正在保存');
  end();
  end();
  expect(getPendingCloudWrites()).toBe(0);
  const unlock = lockForDesktopUpdate();
  expect(() => beginCloudWrite()).toThrow('正在重启');
  unlock();
});
it('releases failed network writes', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  await expect(
    trackedCloudFetch('https://example.invalid', { method: 'POST' }),
  ).rejects.toThrow('offline');
  expect(getPendingCloudWrites()).toBe(0);
});
