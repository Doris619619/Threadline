/** @fileoverview 阶段任务选填估时：编辑时输入分钟，离焦后复用任务的小时分钟格式。 */
'use client';
import { useState } from 'react';
import { formatMinutes, parseEstimateMinutes } from '@/features/tasks/task-time';

/** 保留原始输入供提交校验，非法值不被静默丢弃；Enter 沿用所属表单的连续添加。 */
export function StageEstimateInput({
  value,
  onChange,
  label = '预计分钟（选填）',
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  let display = value;
  let invalid = false;
  try {
    const minutes = parseEstimateMinutes(value);
    if (!focused && minutes !== undefined) display = formatMinutes(minutes);
  } catch {
    invalid = true;
  }
  return (
    <input
      className="stage-estimate-input"
      aria-label={label}
      aria-invalid={invalid || undefined}
      inputMode="numeric"
      placeholder="预计分钟"
      title={label}
      value={display}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
