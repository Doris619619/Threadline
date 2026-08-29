/** @fileoverview 设置页：只呈现当前真实的数据、隐私、桌面与关于功能，不以占位偏好填充分类。 */

'use client';

import {
  Database,
  Info,
  LogOut,
  MonitorCog,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { Surface } from '@/components/ui/surface';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { TrashPanel } from '@/features/history/history-panel';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import type { Task } from '@/types/domain';

type SettingsSection = 'data' | 'privacy' | 'desktop' | 'about';

/** 渲染收缩后的设置入口，并把回收站恢复操作保持在数据分类下。 */
export function SettingsPanel({
  tasks,
  onUpdateTask,
}: {
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
}) {
  const { mode, resetWindowStates } = useDesktopWindow();
  const cloudRuntime = useOptionalCloudRuntime();
  const [section, setSection] = useState<SettingsSection>('data');
  return (
    <div className="settings-panel" data-testid="settings-panel">
      <nav className="settings-tabs" aria-label="设置页面">
        <button
          className={section === 'data' ? 'is-active' : ''}
          onClick={() => setSection('data')}
        >
          <Database size={17} aria-hidden="true" /> 数据
        </button>
        <button
          className={section === 'privacy' ? 'is-active' : ''}
          onClick={() => setSection('privacy')}
        >
          <ShieldCheck size={17} aria-hidden="true" /> 隐私
        </button>
        <button
          className={section === 'desktop' ? 'is-active' : ''}
          onClick={() => setSection('desktop')}
        >
          <MonitorCog size={17} aria-hidden="true" /> 桌面
        </button>
        <button
          className={section === 'about' ? 'is-active' : ''}
          onClick={() => setSection('about')}
        >
          <Info size={17} aria-hidden="true" /> 关于
        </button>
      </nav>
      {section === 'data' && <TrashPanel tasks={tasks} onUpdate={onUpdateTask} />}
      {section === 'privacy' && (
        <Surface className="settings-copy">
          <h2>隐私边界</h2>
          <p>
            任务、项目、Daily、工作站与 Rhythm 会通过同一 Supabase 账号跨设备同步。
            Annotation 笔迹和高亮颜色只保存在当前设备，不会上传。
          </p>
          {cloudRuntime && (
            <>
              <p>当前账号：{cloudRuntime.user.email ?? cloudRuntime.user.id}</p>
              <button
                type="button"
                className="tl-button tl-button--secondary"
                onClick={() => void cloudRuntime.signOut()}
              >
                <LogOut size={16} aria-hidden="true" /> 退出登录
              </button>
            </>
          )}
        </Surface>
      )}
      {section === 'desktop' && (
        <Surface className="desktop-settings">
          <header>
            <div>
              <h2>Windows 桌面窗口</h2>
              <p>完整工作台、迷你今日与工作站共用主窗口；紧凑视图可收起为右侧入口。</p>
            </div>
            <span>
              当前：
              {mode === 'full'
                ? '完整工作台'
                : mode === 'mini-today'
                  ? '迷你今日'
                  : '工作站'}
            </span>
          </header>
          <dl>
            <div>
              <dt>完整工作台</dt>
              <dd>显示首页、日历、项目、洞察、记录、节律与设置。</dd>
            </div>
            <div>
              <dt>迷你今日</dt>
              <dd>置顶快速查看今日日程与无时间待办。</dd>
            </div>
            <div>
              <dt>工作站</dt>
              <dd>置顶显示当前推进任务的引用；不会删除原任务。</dd>
            </div>
          </dl>
          <button
            type="button"
            className="tl-button tl-button--secondary"
            onClick={() => void resetWindowStates()}
          >
            <RotateCcw size={16} aria-hidden="true" /> 重置窗口尺寸与位置
          </button>
        </Surface>
      )}
      {section === 'about' && (
        <Surface className="settings-copy">
          <h2>关于 Threadline</h2>
          <dl>
            <div>
              <dt>版本</dt>
              <dd>0.1.0</dd>
            </div>
            <div>
              <dt>平台</dt>
              <dd>{typeof navigator === 'undefined' ? '未知' : navigator.platform}</dd>
            </div>
            <div>
              <dt>产品</dt>
              <dd>个人任务工作台</dd>
            </div>
          </dl>
        </Surface>
      )}
    </div>
  );
}
