import type { InputHTMLAttributes } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Checkbox({
  className,
  'aria-label': ariaLabel,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn('tl-checkbox', className)} aria-label={ariaLabel}>
      <input type="checkbox" {...props} />
      <span>
        <Check aria-hidden="true" size={14} strokeWidth={3} />
      </span>
    </label>
  );
}
