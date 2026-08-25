/**
 * @fileoverview 工作台首页入口，挂载桌面窗口形态 Provider 与任务仪表盘。
 */

import { DesktopWindowProvider } from '@/lib/desktop-window-context';
import { AppShell } from '@/components/app-shell';
import { TaskDashboard } from '@/features/tasks/task-dashboard';

export default function Home() {
  return (
    <DesktopWindowProvider>
      <AppShell>
        <TaskDashboard />
      </AppShell>
    </DesktopWindowProvider>
  );
}
