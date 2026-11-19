/** @fileoverview 荧光笔开关与当前色点保持独立，五色选择复用顶层菜单、键盘导航和关闭归焦。 */

'use client';

import { cn } from '@/lib/cn';
import { Check, ChevronDown, Highlighter } from 'lucide-react';
import { useId, useRef, useState, type CSSProperties } from 'react';
import { TaskActionsPopover } from '@/features/tasks/components/task-actions-popover';

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
 * 荧光笔按钮可显式退出，未传退出回调时保持旧激活行为；选颜色始终启用绘制。
 * 绘制用 pressed、菜单用 expanded 表达；共享菜单先处理 Escape，关闭后归焦且不退出绘制。
 */
export function AnnotationColorPicker({
  active,
  color,
  onActivate,
  onDeactivate,
  onColorChange,
}: AnnotationColorPickerProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
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

  return (
    <div className="annotation-highlighter-control">
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
        ref={trigger}
        type="button"
        className="annotation-color-menu-trigger annotation-color-button"
        aria-label={`选择颜色，当前${selected?.label ?? '黄色'}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? id : undefined}
        title="选择荧光笔颜色"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span
          className="annotation-color-current-swatch"
          aria-hidden="true"
          style={{ '--annotation-color': solidColor } as CSSProperties}
        />
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <TaskActionsPopover
          anchor={trigger}
          id={id}
          className="annotation-color-menu"
          role="menu"
          label="荧光笔颜色"
          onClose={() => setOpen(false)}
        >
          {HIGHLIGHT_COLOR_PRESETS.map((preset) => {
            const isSelected = color === preset.value;
            return (
              <button
                key={preset.id}
                type="button"
                className={cn('annotation-color-option', isSelected && 'is-selected')}
                role="menuitemradio"
                aria-label={preset.label}
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
                  {isSelected && <Check size={14} aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </TaskActionsPopover>
      )}
    </div>
  );
}
