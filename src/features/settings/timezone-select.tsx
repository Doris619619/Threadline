/** @fileoverview 共用账号时区选择器：常用城市优先，完整 IANA 列表支持其他地区。 */
'use client';
import { timezoneLabel } from '@/lib/account-clock';

/** 提供可校验的 IANA 地区选项；写入期间可冻结选择以保持草稿与提交值一致。 */
export function TimezoneSelect({
  value,
  onChange,
  autoFocus = false,
  disabled = false,
}: {
  value: string;
  onChange: (zone: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
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
        disabled={disabled}
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
