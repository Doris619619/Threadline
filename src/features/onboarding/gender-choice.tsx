/** @fileoverview 个人资料和引导共用的性别选择，说明节律显示规则且不默认推断性别。 */
'use client';
import type { Gender } from './account-preferences';

/** 原生单选组支持方向键与读屏，修改由父组件保存，历史节律数据始终保留。 */
export function GenderChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: Gender | null;
  onChange: (gender: Gender) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="gender-choice" disabled={disabled}>
      <legend>性别</legend>
      <div className="gender-options">
        {(
          [
            { value: 'male', label: '男生' },
            { value: 'female', label: '女生' },
          ] as const
        ).map((option) => (
          <label key={option.value} data-selected={value === option.value}>
            <input
              type="radio"
              name="gender"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      <p>选择男生后将隐藏节律，可随时在设置中修改。已有记录会保留。</p>
    </fieldset>
  );
}
