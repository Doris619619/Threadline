/**
 * @fileoverview 共享按钮原语，统一高度、圆角与主次样式。
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'compact' | 'default';
};

/**
 * 渲染符合 design token 的按钮。variant 控制强调程度，size 只改变高度与内边距。
 */
export function Button({
  children,
  className,
  variant = 'secondary',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'tl-button',
        `tl-button--${variant}`,
        `tl-button--${size}`,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
