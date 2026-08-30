/**
 * @fileoverview Electron Main 与 Web 共用的完整业务运行时，Edge 角色不得导入或挂载此组件。
 */

'use client';

import { AppShell } from '@/components/app-shell';
import { PwaRegistrar } from '@/components/pwa-registrar';
import { CloudRuntimeProvider } from '@/features/auth/cloud-runtime-provider';
import { RhythmStateProvider } from '@/features/rhythm/rhythm-state';
import { TaskDashboard } from '@/features/tasks/task-dashboard';
import { WorkspaceDataProvider } from '@/features/workspace/workspace-data-provider';
import { DesktopWindowProvider } from '@/lib/desktop-window-context';

/** 挂载与数据来源无关的完整业务树和桌面视图状态。 */
function WorkspaceRuntime() {
  return (
    <DesktopWindowProvider>
      <PwaRegistrar />
      <RhythmStateProvider>
        <AppShell>
          <WorkspaceDataProvider>
            <TaskDashboard />
          </WorkspaceDataProvider>
        </AppShell>
      </RhythmStateProvider>
    </DesktopWindowProvider>
  );
}

/** 生产必须经过云配置/认证门禁；只有显式测试构建绕过。 */
export function DesktopMainRuntime() {
  return process.env.NEXT_PUBLIC_THREADLINE_TEST_ADAPTER === 'true' ? (
    <WorkspaceRuntime />
  ) : (
    <CloudRuntimeProvider>
      <WorkspaceRuntime />
    </CloudRuntimeProvider>
  );
}
