import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

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
    >
      {children}
    </button>
  );
}
