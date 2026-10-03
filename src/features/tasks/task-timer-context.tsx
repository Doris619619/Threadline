/** @fileoverview 各任务视图共享的本机计时入口；页面只请求加入，不复制任务或维护计时状态。 */
'use client';
import { createContext, useContext } from 'react';

export type TaskTimerActions = {
  ready: boolean;
  taskIds: string[];
  request: (taskId: string) => void;
};
export const TaskTimerContext = createContext<TaskTimerActions | null>(null);

/** 独立任务视图或测试可没有计时提供器，此时不展示无效入口。 */
export function useTaskTimerActions() {
  return useContext(TaskTimerContext);
}
