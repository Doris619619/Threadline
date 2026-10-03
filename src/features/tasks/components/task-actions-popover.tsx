/** @fileoverview 任务菜单进入浏览器顶层，避开日程滚动裁切，并按视口空间定位。 */
'use client';
import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { TaskMenuPoint } from '../hooks/use-task-menu';

/** 原生 popover 避让视口；桌面隐藏更多后，菜单退出返回打开前的焦点或任务主体。 */
export function TaskActionsPopover({
  anchor,
  children,
  onClose,
  label,
  className = 'task-actions-menu',
  align = 'end',
  role = 'group',
  point,
}: {
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  onClose: () => void;
  label: string;
  className?: string;
  align?: 'start' | 'end';
  role?: 'group' | 'menu';
  point?: TaskMenuPoint;
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
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    /** 菜单不参与列表布局，窗口不足时向上展开并保留内部滚动。 */
    const position = () => {
      const box = trigger.getBoundingClientRect();
      const height = menu.getBoundingClientRect().height;
      const width = menu.getBoundingClientRect().width;
      const bottom = point?.y ?? box.bottom;
      const top =
        bottom + height + 8 <= innerHeight
          ? bottom + 4
          : Math.max(8, (point?.y ?? box.top) - height - 4);
      menu.style.top = `${top}px`;
      const left = point?.x ?? (align === 'start' ? box.left : box.right - width);
      menu.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
    };
    const toggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') close.current();
    };
    menu.addEventListener('toggle', toggle);
    menu.showPopover();
    position();
    menu
      .querySelector<HTMLElement>(
        'input:not(:disabled), button:not(:disabled), select:not(:disabled)',
      )
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
      if (
        menu.contains(document.activeElement) ||
        document.activeElement === document.body
      )
        (trigger.getClientRects().length
          ? trigger
          : previousFocus?.isConnected && previousFocus !== document.body
            ? previousFocus
            : trigger
                .closest(
                  '.stage-task-row, .waiting-task-row, .timeline-row, .quick-task-row',
                )
                ?.querySelector<HTMLElement>('button:not(.task-context-trigger), input')
        )?.focus({ preventScroll: true });
      menu.hidePopover();
    };
  }, [anchor, align, point]);
  /** 菜单上下键跳过禁用项；Escape 关闭并回到触发器，不把按键传给任务行。 */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close.current();
    } else if (
      role === 'menu' &&
      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
    ) {
      event.preventDefault();
      const buttons = [
        ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
          'button:not(:disabled)',
        ),
      ];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const index =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
              buttons.length;
      buttons[index]?.focus();
    }
  }
  return createPortal(
    <div
      ref={ref}
      popover="auto"
      className={className}
      role={role}
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    document.body,
  );
}
