/** @fileoverview 全局时区设置：成功响应立即生效，失败保留选择与幂等请求。 */
'use client';
import { useState } from 'react';
import { useAccountTimezone } from './account-timezone-provider';
import { TimezoneSelect } from './timezone-select';

/** 账号设置与习惯页面共享同一份时区，更新不会改写历史记录。 */
export function AccountTimezoneSettings() {
  const account = useAccountTimezone();
  const [zone, setZone] = useState(account?.settings?.timezone ?? 'UTC');
  const [version, setVersion] = useState(account?.settings?.version ?? 0);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  /** 设置保存直接确认账号版本；网络超时后可重用请求。 */
  const save = async () => {
    if (!account || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await account.saveTimezone(zone, version, requestId);
      setMessage('已保存，所有页面使用此时区。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-copy account-timezone-settings">
      <TimezoneSelect
        value={zone}
        onChange={(next) => {
          setZone(next);
          setVersion(account?.settings?.version ?? 0);
          setRequestId(crypto.randomUUID());
          setMessage('');
        }}
      />
      <p>日期、时钟和新记录均使用此时区，不跟随 Windows 或手机的时区。</p>
      <p>已有记录保留当时的时间与日期；睡觉和工作效率仍在凌晨 04:00 分日。</p>
      <button
        type="button"
        className="tl-button tl-button--primary"
        disabled={busy || !account}
        onClick={() => void save()}
      >
        {busy ? '保存中…' : '保存时区'}
      </button>
      {message && <p role="status">{message}</p>}
      {account?.settings &&
        version !== account.settings.version &&
        !message.startsWith('已保存') && (
          <button
            type="button"
            className="tl-button tl-button--secondary"
            onClick={() => {
              setVersion(account.settings!.version);
              setRequestId(crypto.randomUUID());
              setMessage('');
            }}
          >
            采用最新版本，保留选择
          </button>
        )}
    </div>
  );
}
