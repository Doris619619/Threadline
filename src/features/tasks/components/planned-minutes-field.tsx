/** @fileoverview 可选预计分钟输入，统一新建和详情表单的待定、清空及格式预览。 */
'use client';

import { useState } from 'react';
import { formatEstimate, parseEstimateMinutes } from '../task-time';

/** 受控和非受控表单共用数字分钟字段；清空不影响任务起止时间。 */
export function PlannedMinutesField({
  value,
  defaultValue,
  onChange,
  name = 'planned',
}: {
  value?: string;
  defaultValue?: number;
  onChange?: (value: string) => void;
  name?: string;
}) {
  const [local, setLocal] = useState(defaultValue?.toString() ?? '');
  const text = value ?? local;
  let preview = '请输入整数分钟';
  try {
    preview = formatEstimate(parseEstimateMinutes(text));
  } catch {
    /* 非法草稿由保存校验报告。 */
  }
  /** 同时更新本地表单与可选外部草稿。 */
  const change = (next: string) => {
    setLocal(next);
    onChange?.(next);
  };
  return (
    <div className="estimate-field">
      <label>
        <span>预计（分钟，可选）</span>
        <input
          name={name}
          aria-label="预计时长（分钟）"
          inputMode="numeric"
          value={text}
          placeholder="待定"
          onChange={(event) => change(event.target.value)}
        />
      </label>
      <span className="estimate-preview">{preview}</span>
      <button type="button" onClick={() => change('')} aria-label="清空预计，设为待定">
        待定
      </button>
    </div>
  );
}
