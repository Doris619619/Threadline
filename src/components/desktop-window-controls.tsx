/**
 * @fileoverview 桌面窗口控件：形态切换（Full / Mini / Floating）与最小化、最大化、关闭。
 */

'use client';

import { Circle, LayoutGrid, Minus, PanelTop, Square, X } from 'lucide-react';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import {
  closeTauriWindow,
  minimizeTauriWindow,
  startTauriDragging,
  toggleMaximizeTauriWindow,
  type DesktopWindowMode,
} from '@/lib/tauri-window';

const modeOptions: { id: DesktopWindowMode; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'full', label: '完整工作台', icon: LayoutGrid },
  { id: 'mini-today', label: '迷你今日', icon: PanelTop },
  { id: 'floating-icon', label: '悬浮图标', icon: Circle },
];

/**
 * 渲染窗口形态切换与原生窗口操作按钮；header 区域支持拖拽移动窗口。
 */
export function DesktopWindowControls({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useDesktopWindow();

  return (
    <div className={`tl-desktop-controls${compact ? ' is-compact' : ''}`}>
      <div
        className="tl-drag-region"
        onMouseDown={() => void startTauriDragging()}
        title="拖动窗口"
        aria-hidden={compact}
      />
      <div className="tl-mode-switch" role="group" aria-label="窗口形态">
        {modeOptions.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`tl-mode-btn${mode === id ? ' is-active' : ''}`}
            aria-label={label}
            aria-pressed={mode === id}
            title={label}
            onClick={() => void setMode(id)}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
      <div className="tl-window-actions" role="group" aria-label="窗口操作">
        <button
          type="button"
          className="tl-window-action tl-window-minimize"
          aria-label="最小化"
          title="最小化"
          onClick={() => void minimizeTauriWindow()}
        >
          <Minus size={12} />
        </button>
        <button
          type="button"
          className="tl-window-action tl-window-maximize"
          aria-label="最大化"
          title="最大化"
          onClick={() => void toggleMaximizeTauriWindow()}
        >
          <Square size={11} />
        </button>
        <button
          type="button"
          className="tl-window-action tl-window-close"
          aria-label="关闭"
          title="关闭"
          onClick={() => void closeTauriWindow()}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
