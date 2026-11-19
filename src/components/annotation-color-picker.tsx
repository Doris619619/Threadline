/** @fileoverview 渲染独立荧光笔开关、当前颜色选择按钮及可访问的五色浮层。 */

'use client';

import { cn } from '@/lib/cn';
import { Check, ChevronDown, Highlighter } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

export type HighlightColorPreset = {
  id: 'yellow' | 'pink' | 'blue' | 'green' | 'purple';
  label: string;
  value: string;
};

export const HIGHLIGHT_COLOR_PRESETS: readonly HighlightColorPreset[] = [
  { id: 'yellow', label: '黄色', value: 'rgba(255, 225, 53, 0.42)' },
  { id: 'pink', label: '粉色', value: 'rgba(255, 116, 161, 0.38)' },
  { id: 'blue', label: '蓝色', value: 'rgba(82, 170, 255, 0.38)' },
  { id: 'green', label: '绿色', value: 'rgba(96, 210, 146, 0.38)' },
  { id: 'purple', label: '紫色', value: 'rgba(178, 125, 255, 0.36)' },
];

type AnnotationColorPickerProps = {
  active: boolean;
  color: string;
  onActivate: () => void;
  onDeactivate?: () => void;
  onColorChange: (color: string) => void;
};

/**
 * 荧光笔按钮可显式退出，未传退出回调时保持旧激活行为；选颜色始终启用绘制，Esc 优先关闭浮层。
 */
export function AnnotationColorPicker({
  active,
  color,
  onActivate,
  onDeactivate,
  onColorChange,
}: AnnotationColorPickerProps) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const selected = HIGHLIGHT_COLOR_PRESETS.find((preset) => preset.value === color);
  // 色点使用不透明 RGB 呈现当前色，笔迹仍保留传入颜色原有的透明度。
  const solidColor = color.replace(/^rgba\((.*),\s*[\d.]+\)$/, 'rgb($1)');

  /** 主按钮仅控制绘制开关；旧调用缺少退出能力时仍执行原来的激活动作。 */
  const toggleHighlighter = () => {
    setOpen(false);
    if (active && onDeactivate) onDeactivate();
    else onActivate();
  };

  /** 选色后总是启用荧光笔，避免活动状态下选色被当成再次点击开关而退出。 */
  const selectColor = (nextColor: string) => {
    onColorChange(nextColor);
    onActivate();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    /** 点到控件以外仅收起颜色浮层，不改变当前批注工具。 */
    const onPointerDown = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    /** 捕获第一下 Escape 关闭浮层，避免页面同时退出荧光笔。 */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div className="annotation-highlighter-control" ref={controlRef}>
      <button
        type="button"
        className={cn(
          'annotation-tool-btn',
          'annotation-highlighter-button',
          active && 'is-active',
        )}
        aria-label="荧光笔"
        aria-pressed={active}
        title="荧光笔（Esc 退出）"
        onClick={toggleHighlighter}
      >
        <span className="annotation-highlighter-icon" aria-hidden="true">
          <Highlighter size={15} />
          <span
            className="annotation-current-color annotation-highlighter-underline"
            style={{ '--annotation-color': color } as CSSProperties}
          />
        </span>
      </button>
      <button
        type="button"
        className="annotation-color-menu-trigger annotation-color-button"
        aria-label={`选择颜色，当前${selected?.label ?? '黄色'}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="选择荧光笔颜色"
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className="annotation-color-current-swatch"
          aria-hidden="true"
          style={{ '--annotation-color': solidColor } as CSSProperties}
        />
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="annotation-color-menu" role="dialog" aria-label="荧光笔颜色">
          <span className="annotation-color-menu-title">荧光笔颜色</span>
          <div role="radiogroup" aria-label="选择荧光笔颜色">
            {HIGHLIGHT_COLOR_PRESETS.map((preset) => {
              const isSelected = color === preset.value;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={cn('annotation-color-option', isSelected && 'is-selected')}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => selectColor(preset.value)}
                >
                  <span
                    className="annotation-color-option-swatch"
                    aria-hidden="true"
                    style={{ '--annotation-color': preset.value } as CSSProperties}
                  />
                  <span className="annotation-color-option-label">{preset.label}</span>
                  <span
                    className="annotation-color-option-check"
                    aria-hidden={!isSelected}
                  >
                    {isSelected && <Check size={14} aria-label="当前颜色" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
