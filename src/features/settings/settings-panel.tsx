/**
 * @fileoverview 设置页面，提供桌面窗口说明、重置操作以及历史和回收站的二级入口。
 */

'use client';

import { History, MonitorCog, RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Surface } from '@/components/ui/surface';
import { useDesktopWindow } from '@/lib/desktop-window-context';

/** 将窗口设置与数据历史组织为真实可切换的设置二级页面。 */
export function SettingsPanel({ historyContent }: { historyContent: ReactNode }) {
  const { mode, resetWindowStates } = useDesktopWindow();
  const [section, setSection] = useState<'desktop' | 'history'>('desktop');

  return (
    <div className="settings-panel" data-testid="settings-panel">
      <nav className="settings-tabs" aria-label="设置页面">
        <button className={section === 'desktop' ? 'is-active' : ''} onClick={() => setSection('desktop')}>
          <MonitorCog size={17} aria-hidden="true" /> 桌面窗口
        </button>
        <button className={section === 'history' ? 'is-active' : ''} onClick={() => setSection('history')}>
          <History size={17} aria-hidden="true" /> 历史与回收站
        </button>
      </nav>
      {section === 'desktop' ? (
        <Surface className="desktop-settings">
          <header>
            <div>
              <h2>Windows 桌面窗口</h2>
              <p>完整工作台与迷你今日使用系统标题栏；悬浮图标始终置顶。</p>
            </div>
            <span>当前：{mode === 'full' ? '完整工作台' : mode === 'mini-today' ? '迷你今日' : '悬浮图标'}</span>
          </header>
          <dl>
            <div><dt>完整工作台</dt><dd>显示首页、日程、项目、统计、复盘与设置。</dd></div>
            <div><dt>迷你今日</dt><dd>只显示今日已排程任务，不显示项目和 Daily。</dd></div>
            <div><dt>悬浮图标</dt><dd>单击恢复，拖动移动，右键可调整图标大小。</dd></div>
          </dl>
          <button type="button" className="tl-button tl-button--secondary" onClick={() => void resetWindowStates()}>
            <RotateCcw size={16} aria-hidden="true" /> 重置窗口尺寸与位置
          </button>
        </Surface>
      ) : historyContent}
    </div>
  );
}
