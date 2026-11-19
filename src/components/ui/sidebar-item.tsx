/**
 * @fileoverview 侧边栏导航项组件。
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * 标记当前工作区页面；聚合“更多”入口独立渲染，不冒充当前页面。
 */
export function SidebarItem({
  active = false,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={cn('tl-sidebar-item', active && 'is-active', className)}
      {...props}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </button>
  );
}
