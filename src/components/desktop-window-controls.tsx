/**
 * @fileoverview 桌面窗口模式菜单；用文字化入口切换完整、迷你与悬浮三种形态。
 */

'use client';

import { ChevronDown, CircleDot, Monitor, PanelTop } from 'lucide-react';
import { useState } from 'react';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import type { DesktopWindowMode } from '@/lib/tauri-window';

const modeOptions: {
  id: DesktopWindowMode;
  label: string;
  description: string;
  icon: typeof Monitor;
}[] = [
  { id: 'full', label: '完整工作台', description: '查看今天、待办与 Daily', icon: Monitor },
  { id: 'mini-today', label: '迷你今日', description: '置顶查看今日日程', icon: PanelTop },
  { id: 'floating-icon', label: '悬浮图标', description: '收起为桌面入口', icon: CircleDot },
];

/**
 * 显示可发现的窗口模式菜单；选择后调用桌面窗口桥接切换形态。
 */
export function DesktopWindowModeMenu() {
  const { mode, setMode } = useDesktopWindow();
  const [open, setOpen] = useState(false);
  const current = modeOptions.find((option) => option.id === mode) ?? modeOptions[0];

  const chooseMode = async (next: DesktopWindowMode) => {
    setOpen(false);
    await setMode(next);
  };

  return (
    <div className="tl-mode-menu">
      <button
        type="button"
        className="tl-mode-menu-trigger"
        aria-label="窗口模式"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <current.icon aria-hidden="true" size={16} />
        <span>窗口模式</span>
        <ChevronDown aria-hidden="true" size={14} />
      </button>
      {open && (
        <div className="tl-mode-menu-popover" role="menu" aria-label="窗口模式">
          <p>当前：{current.label}</p>
          {modeOptions.map(({ id, label, description, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={mode === id}
              className={mode === id ? 'is-active' : ''}
              onClick={() => void chooseMode(id)}
            >
              <Icon aria-hidden="true" size={17} />
              <span>
                <b>{label}</b>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
