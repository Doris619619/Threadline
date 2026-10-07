/** @fileoverview 任务浮层进入浏览器顶层，按定位锚点避让视口，退出时焦点返回触发器。 */
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

/** 原生 popover 可用独立 positionAnchor 定位；anchor 始终负责退出焦点，未指定时兼作定位。 */
export function TaskActionsPopover({
  anchor,
  positionAnchor,
  children,
  onClose,
  label,
  className = 'task-actions-menu',
  align = 'end',
  role = 'group',
  point,
}: {
  anchor: RefObject<HTMLElement | null>;
  positionAnchor?: RefObject<HTMLElement | null>;
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
    const positionedAt = positionAnchor?.current ?? trigger;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    /** 按卡片或触发器的边界定位；右键坐标仍优先，窗口不足时向上避让。 */
    const position = () => {
      const box = positionedAt.getBoundingClientRect();
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
  }, [anchor, align, point, positionAnchor]);
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
