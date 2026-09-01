/** @fileoverview 提供项目与 Daily 管理共用的可访问模态 Dialog，负责焦点、键盘和背景交互隔离。 */

'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

type ManagementDialogProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
};

/** 返回 Dialog 内可通过键盘获得焦点的启用控件，供初始聚焦与 Tab 环绕共用。 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute('aria-hidden'));
}

/**
 * 渲染短表单管理 Dialog。
 * 挂载时保存触发控件并把焦点移入首个字段；捕获 Escape 与 Tab，使底层页面既不可聚焦也不可误操作。
 */
export function ManagementDialog({
  title,
  children,
  onClose,
}: ManagementDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const activeElement = document.activeElement;
    returnFocusRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    const focusInitialControl = () => {
      const [first] = getFocusableElements(dialog);
      (first ?? dialog).focus();
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
  }, []);

  return (
    <div className="manager-dialog-backdrop">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="manager-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button aria-label="关闭" onClick={onClose} type="button">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
