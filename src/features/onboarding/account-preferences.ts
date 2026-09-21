/** @fileoverview 账号偏好的最小领域契约与服务器响应校验，避免损坏状态绕过首次引导。 */
export type Gender = 'male' | 'female';
export type AccountPreferences = {
  owner_id: string;
  gender: Gender | null;
  onboarding_completed_at: string | null;
  preferences_version: number;
};

/** 校验 RPC 单行或 PostgREST 单行数组，拒绝其他账号及无性别的完成标记。 */
export function readAccountPreferences(
  value: unknown,
  owner: string,
): AccountPreferences {
  const row = (Array.isArray(value) ? value[0] : value) as AccountPreferences | null;
  if (
    !row ||
    row.owner_id !== owner ||
    ![null, 'male', 'female'].includes(row.gender) ||
    !Number.isInteger(row.preferences_version) ||
    row.preferences_version < 0 ||
    !(
      row.onboarding_completed_at === null ||
      (typeof row.onboarding_completed_at === 'string' &&
        Number.isFinite(Date.parse(row.onboarding_completed_at)))
    ) ||
    (row.onboarding_completed_at !== null && row.gender === null)
  ) {
    throw new Error('账号偏好读取失败，请重新读取。');
  }
  return row;
}

/** 未知账号不显示私密栏目；显式 Preview 默认由适配器提供女生资料。 */
export function canShowRhythm(profile: AccountPreferences | null): boolean {
  return profile?.gender === 'female';
}
