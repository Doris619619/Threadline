/**
 * @fileoverview 将 Supabase User 的可选 metadata 规整为只读身份展示信息，不创建 profile 写入。
 */

import type { User } from '@supabase/supabase-js';

export type UserIdentity = {
  displayName: string;
  email: string;
  avatarLabel: string;
};

/** 从未知 metadata 中读取非空字符串，避免把对象或空白内容渲染为姓名。 */
function readMetadataName(
  metadata: User['user_metadata'],
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** 将已认证用户映射为可展示身份；姓名缺失时稳定回退到邮箱前缀。 */
export function getUserIdentity(user: User): UserIdentity {
  const email = user.email?.trim() || user.id;
  const displayName =
    readMetadataName(user.user_metadata, 'full_name') ??
    readMetadataName(user.user_metadata, 'name') ??
    readMetadataName(user.user_metadata, 'preferred_username') ??
    readMetadataName(user.user_metadata, 'user_name') ??
    email.split('@')[0] ??
    user.id;
  return {
    displayName,
    email,
    avatarLabel: Array.from(displayName.trim())[0]?.toLocaleUpperCase('zh-CN') ?? 'T',
  };
}
