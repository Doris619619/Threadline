/**
 * @fileoverview 自定义复选框，视觉盒小于触控命中区。
 */

import type { InputHTMLAttributes } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * 渲染可访问的复选框。aria-label 挂在 label 上，供任务完成等读屏文案使用。
 */
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
