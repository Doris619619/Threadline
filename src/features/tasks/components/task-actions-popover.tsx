/** @fileoverview 任务菜单进入浏览器顶层，避开日程滚动裁切，并按视口空间定位。 */
'use client';
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** 原生 popover 负责外部点击和 Escape；滚动/缩放时保持菜单与触发器对齐。 */
export function TaskActionsPopover({
  anchor,
  children,
  onClose,
  label,
  className = 'task-actions-menu',
  align = 'end',
  role = 'group',
}: {
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  onClose: () => void;
  label: string;
  className?: string;
  align?: 'start' | 'end';
  role?: 'group' | 'menu';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useLayoutEffect(() => {
    const menu = ref.current;
    const trigger = anchor.current;
    if (!menu || !trigger) return;
    /** 菜单不参与列表布局，窗口不足时向上展开并保留内部滚动。 */
    const position = () => {
      const box = trigger.getBoundingClientRect();
      const height = menu.getBoundingClientRect().height;
      const width = menu.getBoundingClientRect().width;
      const top =
        box.bottom + height + 8 <= innerHeight
          ? box.bottom + 4
          : Math.max(8, box.top - height - 4);
      menu.style.top = `${top}px`;
      const left = align === 'start' ? box.left : box.right - width;
      menu.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
    };
    const toggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') close.current();
    };
    menu.addEventListener('toggle', toggle);
    menu.showPopover();
    position();
    menu
      .querySelector<HTMLElement>('input, button, select')
      ?.focus({ preventScroll: true });
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    const observer = new ResizeObserver(position);
    observer.observe(menu);
    return () => {
      menu.removeEventListener('toggle', toggle);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      observer.disconnect();
      menu.hidePopover();
    };
  }, [anchor, align]);
  return createPortal(
    <div ref={ref} popover="auto" className={className} role={role} aria-label={label}>
      {children}
    </div>,
    document.body,
  );
}
