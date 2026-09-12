/** @fileoverview 共用账号时区选择器：常用城市优先，完整 IANA 列表支持其他地区。 */
'use client';
import { timezoneLabel } from '@/lib/account-clock';

/** 提供清楚的地区名称，值仍使用数据库可校验的 IANA 标识。 */
export function TimezoneSelect({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (zone: string) => void;
  autoFocus?: boolean;
}) {
  const zones = [
    ...new Set([
      'Asia/Shanghai',
      'America/New_York',
      'America/Los_Angeles',
      'Asia/Tokyo',
      'Europe/London',
      'UTC',
      value,
      ...Intl.supportedValuesOf('timeZone'),
    ]),
  ];
  return (
    <label className="account-timezone-field">
      账号时区
      <select
        aria-label="账号时区"
        data-management-initial-focus={autoFocus || undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {timezoneLabel(zone)}
          </option>
        ))}
      </select>
    </label>
  );
}
