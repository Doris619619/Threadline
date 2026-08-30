/** @fileoverview 验证只读账户展示的 metadata 优先级与稳定回退。 */

import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { getUserIdentity } from '@/features/auth/user-identity';

/** 创建仅包含身份展示所需字段的 Supabase User 测试值。 */
function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'test-user-id',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-08-30T00:00:00.000Z',
    email: 'doris@example.com',
    ...overrides,
  };
}

describe('getUserIdentity', () => {
  /** 优先使用真实用户 metadata，不创建或写入 profile 数据。 */
  it('uses the first available name metadata field', () => {
    expect(
      getUserIdentity(
        makeUser({ user_metadata: { full_name: 'Doris Lin', name: 'Ignored' } }),
      ),
    ).toEqual({
      displayName: 'Doris Lin',
      email: 'doris@example.com',
      avatarLabel: 'D',
    });
  });

  /** 名称缺失时回退 email 前缀，确保头像和名称稳定而不伪造信息。 */
  it('falls back to the email prefix and first visible character', () => {
    expect(getUserIdentity(makeUser({ email: '林多丽@example.com' }))).toEqual({
      displayName: '林多丽',
      email: '林多丽@example.com',
      avatarLabel: '林',
    });
  });
});
