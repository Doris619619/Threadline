/** @fileoverview 设置中的个人资料与 Windows 自启动，复用引导的账号和本机写入边界。 */
'use client';
import { useRef, useState } from 'react';
import { useAccountPreferences } from '@/features/onboarding/account-preferences-provider';
import { GenderChoice } from '@/features/onboarding/gender-choice';
import type { Gender } from '@/features/onboarding/account-preferences';
import { useAutoStart } from '@/features/onboarding/use-auto-start';

/** 性别编辑以服务端确认为准；请求期间保持保存名称，失败与外部修改均保留草稿。 */
export function PersonalPreferencesSettings() {
  const account = useAccountPreferences();
  const [draft, setDraft] = useState<Gender | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string>();
  /** 重试保留上次结果至真实响应；成功后清空草稿以重新跟随账号。 */
  const save = async () => {
    if (!account || !draft || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await account.save(draft);
      setDraft(null);
      setError(undefined);
      setMessage('性别已保存，所有设备将同步更新。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  if (!account?.profile) return <p role="status">正在读取个人资料…</p>;
  return (
    <div>
      <GenderChoice
        value={draft ?? account.profile.gender}
        onChange={(gender) => {
          setDraft(gender);
          setMessage('');
          setError(undefined);
        }}
        disabled={busy}
      />
      <button
        type="button"
        className="tl-button tl-button--primary"
        disabled={!draft || busy}
        aria-busy={busy}
        onClick={() => void save()}
      >
        保存
      </button>
      {message && <p role="status">{message}</p>}
      {(error || account.error) && <p role="alert">{error ?? account.error}</p>}
    </div>
  );
}

/** 开关值始终显示系统回读结果，失败可直接重试；非安装版只给出能力说明。 */
export function AutoStartSettings() {
  const auto = useAutoStart();
  return (
    <section className="auto-start-settings" aria-label="开机自启动">
      {auto.state?.supported ? (
        <>
          <label className="auto-start-toggle">
            <span>开机自启动</span>
            <input
              type="checkbox"
              role="switch"
              checked={auto.state.enabled}
              disabled={auto.busy}
              onChange={(event) => {
                void auto.save(event.target.checked).catch(() => undefined);
              }}
            />
          </label>
          <p>登录 Windows 后自动打开 Threadline，仅影响这台电脑。</p>
        </>
      ) : (
        <p>
          {auto.state
            ? '开机自启动仅适用于 Windows 正式安装版。'
            : '正在读取自启动状态…'}
        </p>
      )}
      {auto.error && (
        <>
          <p role="alert">{auto.error}</p>
          <button
            type="button"
            className="tl-button tl-button--secondary"
            onClick={() => void auto.reload()}
          >
            重新读取
          </button>
        </>
      )}
    </section>
  );
}
