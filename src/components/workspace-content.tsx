/** @fileoverview 完整工作区内容分发；习惯不进入首页任务 Hooks，工作站仍优先显示原紧凑面板。 */
'use client';
import dynamic from 'next/dynamic';
import { useWorkspaceView } from './app-shell';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { TaskDashboard } from '@/features/tasks/task-dashboard';

/** 按需模块首次加载保留内容区域和 busy 语义，不插入随后立即消失的打开提示。 */
function pendingWorkspaceSection(label: string) {
  return <section className="workspace-content-pending" aria-label={label} aria-busy />;
}

const HabitsPanel = dynamic(
  () => import('@/features/habits/habits-panel').then((module) => module.HabitsPanel),
  { ssr: false, loading: () => pendingWorkspaceSection('习惯内容') },
);
const TogetherPanel = dynamic(
  () => import('@/features/together/panel').then((module) => module.TogetherPanel),
  { ssr: false, loading: () => pendingWorkspaceSection('两人空间内容') },
);
/** 独立习惯与两人空间按需加载；工作站仍然只承载个人任务执行。 */
export function WorkspaceContent() {
  const { active } = useWorkspaceView();
  const { isWorkstation } = useDesktopWindow();
  if (!isWorkstation && active === 'together') return <TogetherPanel />;
  return !isWorkstation && active === 'habits' ? <HabitsPanel /> : <TaskDashboard />;
}
