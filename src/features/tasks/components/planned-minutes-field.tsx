/** @fileoverview 可选预计分钟输入；留空表示待定，验证由提交表单统一处理。 */
'use client';

import { useState } from 'react';

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
  /** 同时更新本地表单与可选外部草稿。 */
  const change = (next: string) => {
    setLocal(next);
    onChange?.(next);
  };
  return (
    <div className="estimate-field">
      <label>
        <span>预计（分钟）</span>
        <input
          name={name}
          aria-label="预计时长（分钟）"
          inputMode="numeric"
          value={text}
          placeholder="待定"
          onChange={(event) => change(event.target.value)}
        />
      </label>
    </div>
  );
}
