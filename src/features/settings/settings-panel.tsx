/** @fileoverview 呈现只连接真实能力的设置概览与详情，避免以占位偏好制造无响应入口。 */

'use client';

import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  Database,
  Info,
  LogOut,
  MonitorCog,
  Palette,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Surface } from '@/components/ui/surface';
import { useOptionalCloudRuntime } from '@/features/auth/cloud-runtime-provider';
import { getUserIdentity } from '@/features/auth/user-identity';
import { AppearancePanel } from '@/features/appearance/appearance-panel';
import { TrashPanel } from '@/features/history/history-panel';
import { threadlineAppVersion } from '@/lib/app-info';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import type { Task } from '@/types/domain';

type SettingsSection =
  'overview' | 'appearance' | 'sync' | 'privacy' | 'desktop' | 'trash' | 'about';

/** 渲染有明确目标的设置行；仅在真实 section 可用时成为按钮。 */
function SettingsRow({
  icon: Icon,
  title,
  description,
  onClick,
  value,
}: {
  icon: typeof Cloud;
  title: string;
  description: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="settings-row" onClick={onClick}>
      <span className="settings-icon">
        <Icon aria-hidden="true" size={18} />
      </span>
      <span title={description}>
        <b>{title}</b>
      </span>
      <small className="settings-value">{value}</small>
      <ChevronRight aria-hidden="true" size={18} />
    </button>
  );
}

/** 进入当前设置详情并给所有详情页提供一致返回路径。 */
function SettingsDetail({
  title,
  children,
  onBack,
}: {
  title: string;
  children: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="settings-detail">
      <button type="button" className="settings-back" onClick={onBack}>
        <ChevronLeft size={18} aria-hidden="true" /> 设置
      </button>
      <h1>{title}</h1>
      {children}
    </div>
  );
}

/** 渲染设置中心，入口按真实 Cloud 与 Electron capability 过滤。 */
export function SettingsPanel({
  tasks,
  onUpdateTask,
}: {
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
}) {
  const { isNativeDesktop, mode, resetWindowStates } = useDesktopWindow();
  const cloudRuntime = useOptionalCloudRuntime();
  const [section, setSection] = useState<SettingsSection>('overview');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const identity = cloudRuntime ? getUserIdentity(cloudRuntime.user) : undefined;
  /** 发起真实 Supabase 注销，并将失败保留在当前隐私页供用户恢复。 */
  const signOut = async () => {
    if (!cloudRuntime) return;
    setSigningOut(true);
    setSignOutError(undefined);
    try {
      await cloudRuntime.signOut();
    } catch (cause) {
      setSignOutError(
        cause instanceof Error ? cause.message : '退出登录失败，请重试。',
      );
      setSigningOut(false);
    }
  };
  if (section === 'appearance')
    return (
      <SettingsDetail title="外观" onBack={() => setSection('overview')}>
        <AppearancePanel />
      </SettingsDetail>
    );
  if (section === 'sync')
    return (
      <SettingsDetail title="数据与同步" onBack={() => setSection('overview')}>
        <Surface className="settings-copy">
          <Cloud aria-hidden="true" size={24} />
          <p>
            任务、项目、Daily、工作站与节律以当前 Supabase 账号为真源，并在联网后通过
            Realtime 刷新。
          </p>
          <p>
            主题、字体、批注笔迹、高亮颜色和桌面窗口尺寸只保存在当前设备，不会上传到
            Cloud 工作区。
          </p>
        </Surface>
      </SettingsDetail>
    );
  if (section === 'privacy')
    return (
      <SettingsDetail title="隐私" onBack={() => setSection('overview')}>
        <Surface className="settings-copy">
          <ShieldCheck aria-hidden="true" size={24} />
          <p>
            业务数据按账号隔离；生理期起止记录随账号同步，仅当前账号可见，不进入洞察、报告或记录搜索。
          </p>
          {identity && <p>当前登录账号：{identity.email}</p>}
          {cloudRuntime && (
            <button
              type="button"
              className="tl-button tl-button--secondary"
              disabled={signingOut}
              onClick={() => void signOut()}
            >
              <LogOut size={16} aria-hidden="true" />{' '}
              {signingOut ? '正在退出…' : '退出登录'}
            </button>
          )}
          {signOutError && (
            <p className="settings-error" role="alert">
              {signOutError}
            </p>
          )}
        </Surface>
      </SettingsDetail>
    );
  if (section === 'desktop' && isNativeDesktop)
    return (
      <SettingsDetail title="桌面窗口" onBack={() => setSection('overview')}>
        <Surface className="desktop-settings">
          <p>完整工作台与工作站共用主窗口；工作站可收起到左右屏幕边缘。</p>
          <dl>
            <div>
              <dt>当前窗口</dt>
              <dd>{mode === 'full' ? '完整工作台' : '工作站'}</dd>
            </div>
            <div>
              <dt>重置范围</dt>
              <dd>仅清除已保存的位置和尺寸，不修改任务、工作站或同步数据。</dd>
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
      </SettingsDetail>
    );
  if (section === 'trash')
    return (
      <SettingsDetail title="回收站" onBack={() => setSection('overview')}>
        <TrashPanel tasks={tasks} onUpdate={onUpdateTask} />
      </SettingsDetail>
    );
  if (section === 'about')
    return (
      <SettingsDetail title="关于 Threadline" onBack={() => setSection('overview')}>
        <Surface className="settings-copy">
          <Info aria-hidden="true" size={24} />
          <dl>
            <div>
              <dt>版本</dt>
              <dd>{threadlineAppVersion}</dd>
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
      </SettingsDetail>
    );
  return (
    <div className="settings-panel" data-testid="settings-panel">
      <h1 className="settings-title">设置</h1>
      {identity && (
        <Surface className="settings-account-summary">
          <span className="settings-avatar" aria-hidden="true">
            {identity.avatarLabel}
          </span>
          <span>
            <b>{identity.displayName}</b>
            <small>{identity.email}</small>
            <em>
              <Cloud size={14} aria-hidden="true" /> 已登录 · Cloud 工作区
            </em>
          </span>
        </Surface>
      )}
      <section className="settings-group" aria-labelledby="settings-general">
        <h2 id="settings-general">通用</h2>
        <Surface>
          <SettingsRow
            icon={Palette}
            title="外观"
            description="选择主题与字体"
            onClick={() => setSection('appearance')}
          />
          {isNativeDesktop && (
            <SettingsRow
              icon={MonitorCog}
              title="桌面窗口"
              description="管理应用窗口模式与位置"
              onClick={() => setSection('desktop')}
            />
          )}
          <SettingsRow
            icon={Database}
            title="数据与同步"
            description="了解 Cloud 工作区与本地存储"
            onClick={() => setSection('sync')}
          />
        </Surface>
      </section>
      <section className="settings-group" aria-labelledby="settings-privacy">
        <h2 id="settings-privacy">隐私与数据</h2>
        <Surface>
          <SettingsRow
            icon={ShieldCheck}
            title="隐私"
            description="了解数据如何按账号同步"
            onClick={() => setSection('privacy')}
          />
          <SettingsRow
            icon={Trash2}
            title="回收站"
            description="管理已删除的任务"
            onClick={() => setSection('trash')}
          />
        </Surface>
      </section>
      <section className="settings-group" aria-labelledby="settings-about">
        <h2 id="settings-about">关于</h2>
        <Surface>
          <SettingsRow
            icon={Info}
            title="关于 Threadline"
            description={`版本 ${threadlineAppVersion}`}
            value={threadlineAppVersion}
            onClick={() => setSection('about')}
          />
        </Surface>
      </section>
    </div>
  );
}
