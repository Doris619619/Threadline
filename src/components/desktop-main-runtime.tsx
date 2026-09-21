/**
 * @fileoverview Electron Main 与 Web 共用的完整业务运行时，Edge 角色不得导入或挂载此组件。
 */

'use client';

import { AccountTimezoneProvider } from '@/features/settings/account-timezone-provider';
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
import { AccountPreferencesProvider } from '@/features/onboarding/account-preferences-provider';
import { OnboardingGate } from '@/features/onboarding/onboarding-gate';

/** 个性化完成后才加载业务树，避免短暂显示不适用的栏目或恢复过小窗口。 */
function WorkspaceRuntime() {
  return (
    <AccountPreferencesProvider>
      <OnboardingGate>
        <AccountTimezoneProvider>
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
        </AccountTimezoneProvider>
      </OnboardingGate>
    </AccountPreferencesProvider>
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
