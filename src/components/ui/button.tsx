import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'compact' | 'default';
};

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
