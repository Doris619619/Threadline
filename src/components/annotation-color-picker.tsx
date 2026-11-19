/** @fileoverview 批注荧光笔五色选择复用互斥菜单、顶层定位与键盘归焦，绘制模式仍独立控制。 */

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
  onColorChange: (color: string) => void;
};

/**
 * 将绘制启用和颜色选择分成两个明确动作；浮层打开时 Esc 只关闭浮层，避免误退出荧光笔。
 */
export function AnnotationColorPicker({
  active,
  color,
  onActivate,
  onColorChange,
}: AnnotationColorPickerProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = HIGHLIGHT_COLOR_PRESETS.find((preset) => preset.value === color);

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
        title="荧光笔（Esc 退出）"
        onClick={onActivate}
      >
        <Highlighter size={15} />
        <span
          className="annotation-current-color"
          aria-hidden="true"
          style={{ '--annotation-color': color } as CSSProperties}
        />
      </button>
      <button
        ref={trigger}
        type="button"
        className="annotation-color-menu-trigger"
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
                onClick={() => {
                  onColorChange(preset.value);
                  onActivate();
                  setOpen(false);
                }}
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
