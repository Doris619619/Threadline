/** @fileoverview 引导与外观设置共用的四主题预览，只改变主题，不联动字体或性别。 */
'use client';
import { Check } from 'lucide-react';
import { ThemeIllustration } from './theme-illustration';
import { CottageScene } from './cottage-scene';
import type { AppearancePreferences } from './appearance-preferences';

const themes = [
  { id: 'blue', label: '默认蓝色', description: '清爽 · 专注 · 熟悉' },
  { id: 'anya', label: '安妮雅', description: '樱花粉 · 奶油白' },
  { id: 'cottage', label: '皮卡小屋', description: '糖果像素 · 回到自己的家' },
  { id: 'classic', label: '皮卡经典', description: '经典页签 · 奶油像素界面' },
] as const;

/** 使用真实缩略主题和可读选中状态；选择动作由使用页面负责保存及错误反馈。 */
export function ThemeChoices({
  theme,
  onSelect,
}: {
  theme: AppearancePreferences['theme'];
  onSelect: (theme: AppearancePreferences['theme']) => void;
}) {
  return (
    <fieldset className="appearance-section">
      <legend>主题</legend>
      <div className="appearance-theme-options">
        {themes.map((item) => (
          <button
            key={item.id}
            type="button"
            className="appearance-theme-option"
            aria-pressed={theme === item.id}
            onClick={() => onSelect(item.id)}
          >
            <span
              className={`appearance-preview appearance-preview--${item.id}`}
              aria-hidden="true"
            >
              <span className="appearance-preview-heading">我的工作台</span>
              <span className="appearance-preview-line">
                <i />
                <span className="appearance-preview-bar" />
              </span>
              <span className="appearance-preview-line">
                <i />
                <span className="appearance-preview-bar" />
              </span>
              {item.id === 'anya' && <ThemeIllustration />}
              {item.id === 'cottage' && <CottageScene />}
            </span>
            <span className="appearance-option-label">
              <strong>{item.label}</strong>
              <Check size={18} aria-hidden="true" />
            </span>
            <small>{item.description}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
