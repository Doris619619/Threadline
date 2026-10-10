/** @fileoverview 原生模态承载编辑和右侧详情，提供焦点隔离、Escape 退出与返回焦点。 */
'use client';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
/** 共用原生模态；可见后聚焦可选字段，关闭后返回打开者；忙碌时锁定关闭并标记 aria-busy，保持正文稳定。 */
export function SpaceDialog({
  title,
  children,
  onClose,
  busy = false,
  error = '',
  drawer = false,
  className = '',
  initialFocusRef,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  error?: string;
  drawer?: boolean;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  // 在子输入框 autoFocus 之前记录打开者；关闭模态后才能把焦点移回背景按钮。
  const [previous] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    // React autoFocus 可能先于 showModal 执行；可见后再聚焦指定字段。
    initialFocusRef?.current?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, [previous, initialFocusRef]);
  return createPortal(
    <dialog
      ref={ref}
      className={['together-dialog', drawer && 'is-drawer', className]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={id}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        // React 事件会沿 Portal 的组件树冒泡，Escape 只关闭最上层表单。
        event.stopPropagation();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <button type="button" aria-label="关闭" disabled={busy} onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
      {error && (
        <p className="together-error" role="alert">
          {error}
        </p>
      )}
    </dialog>,
    document.body,
  );
}
