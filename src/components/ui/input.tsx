/**
 * @fileoverview 共享文本输入原语。
 */

import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * 渲染标准单行输入，高度与按钮默认档对齐。
 */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('tl-input', className)} {...props} />;
}
