/** @fileoverview 提供项目与 Daily 管理共用的可访问模态 Dialog，负责焦点、键盘和背景交互隔离。 */

'use client';

import { useEffect, useLayoutEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ManagementDialogProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  initialFocusSelector?: string;
  busy?: boolean;
  error?: string;
};

/** 返回 Dialog 内可通过键盘获得焦点的启用控件，供初始聚焦与 Tab 环绕共用。 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter(
    (element) => !element.hasAttribute('aria-hidden') && !element.matches(':disabled'),
  );
}

/**
 * 渲染短表单管理 Dialog。
 * 挂载时保存触发控件并把焦点移入 data-management-initial-focus 指定的业务字段；捕获 Escape 与 Tab，使底层页面既不可聚焦也不可误操作。
 */
export function ManagementDialog({
  title,
  children,
  onClose,
  initialFocusSelector = '[data-management-initial-focus]',
  busy = false,
  error,
}: ManagementDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    closeRef.current = () => {
      if (!busy) onClose();
    };
  }, [busy, onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const activeElement = document.activeElement;
    returnFocusRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    const focusInitialControl = () => {
      const requested = dialog.querySelector<HTMLElement>(initialFocusSelector);
      const [first] = getFocusableElements(dialog);
      (requested ?? first ?? dialog).focus();
    };
    focusInitialControl();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [initialFocusSelector]);

  return createPortal(
    <div className="manager-dialog-backdrop">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        aria-busy={busy}
        className="manager-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button aria-label="关闭" disabled={busy} onClick={onClose} type="button">
            ×
          </button>
        </header>
        <fieldset className="manager-dialog-fields" disabled={busy}>
          {children}
        </fieldset>
        {busy && <p role="status">正在保存…</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>,
    document.body,
  );
}
