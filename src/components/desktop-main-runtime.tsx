/**
 * @fileoverview Electron Main 与 Web 共用的完整业务运行时，Edge 角色不得导入或挂载此组件。
 */

'use client';

import { AppShell } from '@/components/app-shell';
import { PwaRegistrar } from '@/components/pwa-registrar';
import { CloudRuntimeProvider } from '@/features/auth/cloud-runtime-provider';
import { RhythmStateProvider } from '@/features/rhythm/rhythm-state';
import { WorkspaceContent } from '@/components/workspace-content';
import { HabitsStateProvider } from '@/features/habits/habit-state';
import { WorkspaceDataProvider } from '@/features/workspace/workspace-data-provider';
import { DesktopWindowProvider } from '@/lib/desktop-window-context';
import { usesLocalWorkspace } from '@/lib/workspace-runtime';
import { DesktopUpdateRuntime } from '@/features/desktop-update/update-runtime';

/** 挂载与数据来源无关的完整业务树和桌面视图状态。 */
function WorkspaceRuntime() {
  return (
    <DesktopWindowProvider>
      <PwaRegistrar />
      <RhythmStateProvider>
        <AppShell>
          <HabitsStateProvider>
            <WorkspaceDataProvider>
              <WorkspaceContent />
            </WorkspaceDataProvider>
          </HabitsStateProvider>
        </AppShell>
      </RhythmStateProvider>
    </DesktopWindowProvider>
  );
}

/** 生产必须经过云配置/认证门禁；Preview 演示与显式测试直接进入本地工作台。 */
export function DesktopMainRuntime() {
  return (
    <DesktopUpdateRuntime>
      {usesLocalWorkspace() ? (
        <WorkspaceRuntime />
      ) : (
        <CloudRuntimeProvider>
          <WorkspaceRuntime />
        </CloudRuntimeProvider>
      )}
    </DesktopUpdateRuntime>
  );
}
