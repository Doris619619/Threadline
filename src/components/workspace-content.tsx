/** @fileoverview 完整工作区内容分发；习惯不进入首页任务 Hooks，工作站仍优先显示原紧凑面板。 */
'use client';
import dynamic from 'next/dynamic';
import { useWorkspaceView } from './app-shell';
import { useDesktopWindow } from '@/lib/desktop-window-context';
import { TaskDashboard } from '@/features/tasks/task-dashboard';

const HabitsPanel = dynamic(
  () => import('@/features/habits/habits-panel').then((module) => module.HabitsPanel),
  { ssr: false, loading: () => <p role="status">正在打开习惯…</p> },
);
/** 保留既有其他栏目分发，仅把独立习惯页与任务执行逻辑隔离。 */
export function WorkspaceContent() {
  const { active } = useWorkspaceView();
  const { isWorkstation } = useDesktopWindow();
  return !isWorkstation && active === 'habits' ? <HabitsPanel /> : <TaskDashboard />;
}
