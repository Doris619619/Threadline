/** @fileoverview 任务表单与菜单共用顶层浮层、视口避让和焦点归还；菜单支持完整键盘导航。 */
'use client';
import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { positionPopover } from '@/components/ui/popover-position';
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
  id,
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
  id?: string;
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
    const document = trigger.ownerDocument;
    const view = document.defaultView ?? window;
    const previousFocus =
      document.activeElement && 'focus' in document.activeElement
        ? (document.activeElement as HTMLElement)
        : undefined;
    /** 按实际可见视口定位；右键优先，软键盘和边缘空间不足时限制高度并允许内部滚动。 */
    const position = () => {
      const box = positionedAt.getBoundingClientRect();
      const visible = view.visualViewport;
      const viewport = {
        top: visible?.offsetTop ?? 0,
        left: visible?.offsetLeft ?? 0,
        height: visible?.height ?? view.innerHeight,
        width: visible?.width ?? view.innerWidth,
      };
      // 先测量自然高度，避免上一次的受限高度影响本次方向判断。
      menu.style.maxHeight = `${Math.max(0, viewport.height - 16)}px`;
      menu.style.maxWidth = `${Math.max(0, viewport.width - 16)}px`;
      const placement = positionPopover({
        anchor: box,
        viewport,
        menu: menu.getBoundingClientRect(),
        align,
        point,
      });
      menu.style.maxHeight = `${placement.maxHeight}px`;
      menu.style.top = `${placement.top}px`;
      menu.style.left = `${placement.left}px`;
    };
    const toggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') close.current();
    };
    /** 操作菜单在切换窗口时收起；表单浮层保留草稿与编辑位置。 */
    const onWindowBlur = () => {
      if (role === 'menu') close.current();
    };
    menu.addEventListener('toggle', toggle);
    menu.showPopover();
    position();
    if (role === 'menu') {
      for (const item of menu.querySelectorAll<HTMLElement>('[role^="menuitem"]'))
        item.tabIndex = -1;
    }
    const selectedItem =
      role === 'menu'
        ? menu.querySelector<HTMLElement>(
            '[role="menuitemradio"][aria-checked="true"]:not(:disabled)',
          )
        : null;
    (
      selectedItem ??
      menu.querySelector<HTMLElement>(
        role === 'menu'
          ? '[role^="menuitem"]:not(:disabled)'
          : 'input:not(:disabled), button:not(:disabled), select:not(:disabled)',
      )
    )?.focus({ preventScroll: true });
    view.addEventListener('resize', position);
    view.addEventListener('blur', onWindowBlur);
    view.addEventListener('scroll', position, true);
    view.visualViewport?.addEventListener('resize', position);
    view.visualViewport?.addEventListener('scroll', position);
    const observer = new ResizeObserver(position);
    observer.observe(menu);
    return () => {
      menu.removeEventListener('toggle', toggle);
      view.removeEventListener('resize', position);
      view.removeEventListener('blur', onWindowBlur);
      view.removeEventListener('scroll', position, true);
      view.visualViewport?.removeEventListener('resize', position);
      view.visualViewport?.removeEventListener('scroll', position);
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
      if (menu.isConnected && menu.matches(':popover-open')) menu.hidePopover();
    };
  }, [anchor, align, point, positionAnchor, role]);
  /** 菜单方向键跳过禁用项；Tab 关闭后继续原页面顺序，表单浮层保留自身 Tab 顺序。 */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close.current();
    } else if (role === 'menu' && event.key === 'Tab') {
      close.current();
      anchor.current?.focus({ preventScroll: true });
    } else if (
      role === 'menu' &&
      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      const buttons = [
        ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
          '[role^="menuitem"]:not(:disabled)',
        ),
      ];
      const current = buttons.indexOf(
        event.currentTarget.ownerDocument.activeElement as HTMLButtonElement,
      );
      const index =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
              buttons.length;
      buttons[index]?.focus({ preventScroll: true });
      buttons[index]?.scrollIntoView?.({ block: 'nearest' });
    }
  }
  return createPortal(
    <div
      ref={ref}
      id={id}
      popover="auto"
      className={className}
      role={role}
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    anchor.current?.closest('dialog, [aria-modal="true"]') ??
      anchor.current?.ownerDocument.body ??
      document.body,
  );
}
