/** @fileoverview 登录后的首次个性化门禁：账号完成后仅补问本机自启动，等待设置时暂停业务加载遮罩。 */
'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DesktopEntryChrome } from '@/components/desktop-entry-chrome';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { useOptionalStartupProgress } from '@/features/startup/startup-progress-context';
import { ThemeChoices } from '@/features/appearance/theme-choices';
import {
  getAppearance,
  saveAppearance,
  useAppearance,
} from '@/features/appearance/appearance-store';
import { useAccountPreferences } from './account-preferences-provider';
import { useAutoStart } from './use-auto-start';
import { GenderChoice } from './gender-choice';
import type { Gender } from './account-preferences';

/** 资料确认前不挂载业务树，首次进入后刷新本机开关不重新打断工作台。 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const account = useAccountPreferences()!;
  const autoStart = useAutoStart();
  const cloud = useOptionalCloudRuntime();
  const [entered, setEntered] = useState(false);
  const setPersonalizationActive =
    useOptionalStartupProgress()?.setPersonalizationActive;
  const ready = Boolean(
    account.profile?.onboarding_completed_at && autoStart.state?.decided,
  );
  useLayoutEffect(() => {
    setPersonalizationActive?.(!entered && !ready);
    return () => setPersonalizationActive?.(false);
  }, [entered, ready, setPersonalizationActive]);
  if (ready && !entered) setEntered(true);
  const [exitError, setExitError] = useState<string>();
  /** 失败留在引导，不能伪装已退出；旧账号会话由上层认证运行时销毁。 */
  const signOut = async () => {
    try {
      await cloud?.signOut();
    } catch (cause) {
      setExitError(cause instanceof Error ? cause.message : '退出失败，请重试。');
    }
  };
  if (entered || ready) return children;
  return (
    <main className="onboarding-page">
      <DesktopEntryChrome />
      <section className="onboarding-card" aria-label="首次使用设置">
        {!account.profile || !autoStart.state ? (
          <>
            <h1>正在准备你的工作台</h1>
            <p role="status">正在读取个人设置…</p>
            {(account.error || autoStart.error) && (
              <>
                <p role="alert">{account.error ?? autoStart.error}</p>
                <button
                  type="button"
                  className="tl-button tl-button--secondary"
                  onClick={() => {
                    void account.reload();
                    void autoStart.reload();
                  }}
                >
                  重新读取
                </button>
              </>
            )}
          </>
        ) : (
          <OnboardingSteps autoStart={autoStart} />
        )}
        {cloud && (
          <button
            type="button"
            className="onboarding-sign-out"
            onClick={() => void signOut()}
          >
            退出账号
          </button>
        )}
        {exitError && <p role="alert">{exitError}</p>}
      </section>
    </main>
  );
}

/** 分步保存：主题本机即时预览，性别由账号确认，最后提交才记录完成。 */
function OnboardingSteps({
  autoStart,
}: {
  autoStart: ReturnType<typeof useAutoStart>;
}) {
  const account = useAccountPreferences()!;
  const appearance = useAppearance();
  const [deviceOnly] = useState(Boolean(account.profile!.onboarding_completed_at));
  const [step, setStep] = useState(deviceOnly ? 2 : 0);
  const [gender, setGender] = useState<Gender | null>(account.profile!.gender);
  const [enabled, setEnabled] = useState(autoStart.state!.enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [themeError, setThemeError] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const locked = useRef(false);
  const desktop = autoStart.state!.supported;
  const total = deviceOnly ? 1 : desktop ? 3 : 2;
  const last = step === 2 || (step === 1 && !desktop);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  /** 禁止重复提交；自启动成功但云保存失败时留在当前步，重试安全。 */
  const next = async (defer = false) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (step === 0) setStep(1);
      else if (step === 1) {
        if (!gender) throw new Error('请选择性别后继续。');
        await account.save(gender, !desktop);
        if (desktop) setStep(2);
      } else {
        await autoStart.save(defer ? undefined : enabled);
        if (!deviceOnly) await account.save(null, true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <p className="onboarding-eyebrow">
        {deviceOnly ? '这台电脑的设置' : '让 Threadline 更适合你'}
      </p>
      <p className="onboarding-progress" aria-label="设置进度">
        第 {deviceOnly ? 1 : step + 1} 步，共 {total} 步
      </p>
      <h1 ref={heading} tabIndex={-1}>
        {['选择喜欢的主题', '设置你的个人资料', '每天，从这里开始'][step]}
      </h1>
      <p className="onboarding-intro">
        {step === 0
          ? '选一个喜欢的样子，随时都能在设置中调整。'
          : step === 1
            ? '按你的选择，显示适合你的栏目。'
            : '登录 Windows 后自动打开 Threadline。仅影响这台电脑。'}
      </p>
      {step === 0 && (
        <>
          <ThemeChoices
            theme={appearance.theme}
            onSelect={(theme) => {
              setThemeError(
                saveAppearance({ ...getAppearance(), theme })
                  ? undefined
                  : '主题已预览，但无法保存到本机；请允许本地存储后重试。',
              );
            }}
          />
          {themeError && <p role="alert">{themeError}</p>}
        </>
      )}
      {step === 1 && (
        <GenderChoice value={gender} onChange={setGender} disabled={busy} />
      )}
      {step === 2 && (
        <div className="onboarding-startup">
          <label className="auto-start-toggle">
            <span>开机自启动</span>
            <input
              type="checkbox"
              role="switch"
              checked={enabled}
              disabled={busy}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </label>
          <p>也可以以后再选，在「设置 → 桌面」中开启。</p>
        </div>
      )}
      {(error || autoStart.error) && (
        <p className="settings-error" role="alert">
          {error ?? autoStart.error}
        </p>
      )}
      <div className="onboarding-actions">
        {step > 0 && !deviceOnly && (
          <button
            type="button"
            className="tl-button tl-button--secondary"
            disabled={busy}
            onClick={() => {
              setError(undefined);
              setStep(step - 1);
            }}
          >
            上一步
          </button>
        )}
        {step === 2 && (
          <button
            type="button"
            className="tl-button tl-button--secondary"
            disabled={busy}
            onClick={() => void next(true)}
          >
            以后再选
          </button>
        )}
        <button
          type="button"
          className="tl-button tl-button--primary"
          disabled={
            busy || (step === 1 && !gender) || (step === 0 && Boolean(themeError))
          }
          onClick={() => void next()}
        >
          {busy ? '正在保存…' : last ? '进入工作台' : '继续'}
        </button>
      </div>
      <p className="onboarding-footnote">这些选择都可以在设置中修改。</p>
    </>
  );
}
