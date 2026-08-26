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
              <p>完整工作台、迷你今日与工作站共用同一个主窗口；紧凑视图可收起为右侧入口。</p>
            </div>
            <span>当前：{mode === 'full' ? '完整工作台' : mode === 'mini-today' ? '迷你今日' : '工作站'}</span>
          </header>
          <dl>
            <div><dt>完整工作台</dt><dd>显示首页、日程、项目、统计、复盘与设置。</dd></div>
            <div><dt>迷你今日</dt><dd>置顶快速查看今日日程与无时间待办，可直接维护工作站。</dd></div>
            <div><dt>工作站</dt><dd>置顶显示当前推进的任务引用；移除和清空均不会删除原任务。</dd></div>
            <div><dt>右侧悬浮标</dt><dd>不是第四种窗口模式，而是迷你今日或工作站的收起状态；悬停自动展开。</dd></div>
          </dl>
          <button type="button" className="tl-button tl-button--secondary" onClick={() => void resetWindowStates()}>
            <RotateCcw size={16} aria-hidden="true" /> 重置窗口尺寸与位置
          </button>
        </Surface>
      ) : historyContent}
    </div>
  );
}
