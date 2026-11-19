/** @fileoverview 验证荧光笔启停、兼容旧调用、选色激活与浮层 Escape 隔离，不断言展示样式。 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AnnotationColorPicker,
  HIGHLIGHT_COLOR_PRESETS,
} from '@/components/annotation-color-picker';

const yellow = HIGHLIGHT_COLOR_PRESETS.find((preset) => preset.id === 'yellow')!;
const blue = HIGHLIGHT_COLOR_PRESETS.find((preset) => preset.id === 'blue')!;

afterEach(cleanup);

/** 提供受控按钮的调用边界；父页面通过 active 属性反馈实际工具状态。 */
function pickerCallbacks() {
  return {
    onActivate: vi.fn(),
    onDeactivate: vi.fn(),
    onColorChange: vi.fn(),
  };
}

describe('AnnotationColorPicker', () => {
  it('activates an inactive pen and deactivates the active pen when the parent supports toggling', () => {
    const callbacks = pickerCallbacks();
    const view = render(
      <AnnotationColorPicker active={false} color={yellow.value} {...callbacks} />,
    );
    const pen = screen.getByRole('button', { name: '荧光笔', exact: true });
    expect(pen).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pen);
    expect(callbacks.onActivate).toHaveBeenCalledTimes(1);
    expect(callbacks.onDeactivate).not.toHaveBeenCalled();

    view.rerender(<AnnotationColorPicker active color={yellow.value} {...callbacks} />);
    expect(pen).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '选择颜色，当前黄色' }));
    expect(screen.getByRole('dialog', { name: '荧光笔颜色' })).toBeInTheDocument();
    fireEvent.click(pen);
    expect(callbacks.onDeactivate).toHaveBeenCalledTimes(1);
    expect(callbacks.onActivate).toHaveBeenCalledTimes(1);
    expect(callbacks.onColorChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', { name: '荧光笔颜色' }),
    ).not.toBeInTheDocument();
  });

  it('preserves activation behavior for an older caller without onDeactivate', () => {
    const callbacks = pickerCallbacks();
    render(
      <AnnotationColorPicker
        active
        color={yellow.value}
        onActivate={callbacks.onActivate}
        onColorChange={callbacks.onColorChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '荧光笔', exact: true }));
    expect(callbacks.onActivate).toHaveBeenCalledTimes(1);
    expect(callbacks.onColorChange).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'opens only the existing color palette and always activates a chosen color when active=%s',
    (active) => {
      const callbacks = pickerCallbacks();
      render(
        <AnnotationColorPicker active={active} color={yellow.value} {...callbacks} />,
      );
      fireEvent.click(screen.getByRole('button', { name: '选择颜色，当前黄色' }));
      const palette = screen.getByRole('dialog', { name: '荧光笔颜色' });
      expect(within(palette).getAllByRole('radio')).toHaveLength(5);
      expect(within(palette).getByRole('radio', { name: /^黄色/ })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(callbacks.onActivate).not.toHaveBeenCalled();
      expect(callbacks.onDeactivate).not.toHaveBeenCalled();
      expect(callbacks.onColorChange).not.toHaveBeenCalled();

      fireEvent.click(within(palette).getByRole('radio', { name: '蓝色' }));
      expect(callbacks.onColorChange).toHaveBeenCalledExactlyOnceWith(blue.value);
      expect(callbacks.onActivate).toHaveBeenCalledTimes(1);
      expect(callbacks.onDeactivate).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('dialog', { name: '荧光笔颜色' }),
      ).not.toBeInTheDocument();
    },
  );

  it('choosing the current color keeps drawing active instead of toggling it off', () => {
    const callbacks = pickerCallbacks();
    render(<AnnotationColorPicker active color={yellow.value} {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: '选择颜色，当前黄色' }));
    fireEvent.click(screen.getByRole('radio', { name: /^黄色/ }));
    expect(callbacks.onColorChange).toHaveBeenCalledExactlyOnceWith(yellow.value);
    expect(callbacks.onActivate).toHaveBeenCalledTimes(1);
    expect(callbacks.onDeactivate).not.toHaveBeenCalled();
  });

  it('consumes the first Escape to close the palette and lets the next Escape reach the page', () => {
    const callbacks = pickerCallbacks();
    const pageEscape = vi.fn();
    render(<AnnotationColorPicker active color={yellow.value} {...callbacks} />);
    window.addEventListener('keydown', pageEscape);
    try {
      fireEvent.click(screen.getByRole('button', { name: '选择颜色，当前黄色' }));
      fireEvent.keyDown(screen.getByRole('radio', { name: /^黄色/ }), {
        key: 'Escape',
      });
      expect(
        screen.queryByRole('dialog', { name: '荧光笔颜色' }),
      ).not.toBeInTheDocument();
      expect(pageEscape).not.toHaveBeenCalled();
      expect(callbacks.onDeactivate).not.toHaveBeenCalled();

      fireEvent.keyDown(screen.getByRole('button', { name: '荧光笔', exact: true }), {
        key: 'Escape',
      });
      expect(pageEscape).toHaveBeenCalledTimes(1);
      expect(callbacks.onActivate).not.toHaveBeenCalled();
      expect(callbacks.onDeactivate).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', pageEscape);
    }
  });
});
