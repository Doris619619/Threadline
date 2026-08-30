/** @fileoverview 渲染侧栏真实账号 disclosure，并提供设置跳转和安全退出登录。 */

'use client';

import { Cloud, LogOut, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { UserIdentity } from '@/features/auth/user-identity';

/** 展开账号操作并在 Escape 或外部点击时关闭；不使用需方向键模型的 menu role。 */
export function AccountDisclosure({
  identity,
  onOpenSettings,
  signOut,
}: {
  identity: UserIdentity;
  onOpenSettings: () => void;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = 'threadline-account-disclosure';

  /** 关闭浮层并把键盘焦点还给其原始 trigger。 */
  const closeAndRestoreFocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    /** 点击 disclosure 外部时关闭，避免浮层遮挡后续工作。 */
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    /** Escape 遵循 disclosure 的标准退出路径并恢复 trigger focus。 */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAndRestoreFocus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /** 进入真实设置页并关闭 disclosure，避免保留遮挡层。 */
  const openSettings = () => {
    setOpen(false);
    onOpenSettings();
  };

  /** 调用 Supabase signOut；失败时保持当前会话并显示恢复信息。 */
  const handleSignOut = async () => {
    setSigningOut(true);
    setError(undefined);
    try {
      await signOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '退出登录失败，请重试。');
      setSigningOut(false);
    }
  };

  return (
    <div className="tl-account-disclosure" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="tl-profile"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="tl-avatar" aria-hidden="true">
          {identity.avatarLabel}
        </span>
        <span className="tl-profile-copy">
          <b>{identity.displayName}</b>
          <small>已登录 · Cloud 工作区</small>
        </span>
        <span className="tl-profile-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      {open && (
        <section id={panelId} className="tl-account-popover" aria-label="账户选项">
          <header>
            <span className="tl-avatar tl-avatar--large" aria-hidden="true">
              {identity.avatarLabel}
            </span>
            <span>
              <b>{identity.displayName}</b>
              <small>{identity.email}</small>
              <em>
                <Cloud size={14} aria-hidden="true" /> 已登录 · Cloud 工作区
              </em>
            </span>
          </header>
          <div className="tl-account-actions">
            <button type="button" onClick={openSettings}>
              <Settings size={18} aria-hidden="true" /> 设置
            </button>
            <button
              type="button"
              className="is-danger"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              <LogOut size={18} aria-hidden="true" />{' '}
              {signingOut ? '正在退出…' : '退出登录'}
            </button>
          </div>
          {error && (
            <p className="tl-account-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
