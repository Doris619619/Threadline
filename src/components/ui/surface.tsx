import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Surface({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={cn('tl-surface', className)} {...props}>
      {children}
    </section>
  );
}
