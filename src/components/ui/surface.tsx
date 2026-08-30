/**
 * @fileoverview 页面卡片表面，提供凸起与平面两种层级。
 */

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type SurfaceVariant = 'raised' | 'flat';

/**
 * 渲染一块内容表面。raised 用于主卡片，flat 用于嵌套或统计条，避免卡片套卡片的重阴影。
 */
export function Surface({
  children,
  className,
  variant = 'raised',
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode; variant?: SurfaceVariant }) {
  return (
    <section
      className={cn('tl-surface', `tl-surface--${variant}`, className)}
      {...props}
    >
      {children}
    </section>
  );
}
