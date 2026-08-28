/**
 * @fileoverview Electron Main 与 Web 共用的完整业务运行时，Edge 角色不得导入或挂载此组件。
 */

'use client';

import { AppShell } from '@/components/app-shell';
import { PwaRegistrar } from '@/components/pwa-registrar';
import { RhythmStateProvider } from '@/features/rhythm/rhythm-state';
import { TaskDashboard } from '@/features/tasks/task-dashboard';
import { WorkspaceDataProvider } from '@/features/workspace/workspace-data-provider';
import { DesktopWindowProvider } from '@/lib/desktop-window-context';

/** 挂载完整业务树及其桌面视图状态 Provider。 */
export function DesktopMainRuntime() {
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
