/**
 * @fileoverview 保存任务新增行跨页面切换的临时草稿，不包含创建任务或项目的业务副作用。
 */

'use client';

import { useState } from 'react';

/** 日程新增行的全部可恢复输入字段。 */
export type TimedTaskCreateDraft = {
  actual: string;
  completed: boolean;
  endTime: string;
  isAddingProject: boolean;
  planned: string;
  projectId: string;
  projectName: string;
  startTime: string;
  timeError?: string;
  title: string;
};

/** 无时间待办新增行的全部可恢复输入字段。 */
export type QuickTaskCreateDraft = {
  completed: boolean;
  isAddingProject: boolean;
  projectId: string;
  projectName: string;
  title: string;
};

const initialTimedDraft = (projectId: string): TimedTaskCreateDraft => ({
  actual: '',
  completed: false,
  endTime: '',
  isAddingProject: false,
  planned: '',
  projectId,
  projectName: '',
  startTime: '',
  title: '',
});
const initialQuickDraft = (projectId: string): QuickTaskCreateDraft => ({
  completed: false,
  isAddingProject: false,
  projectId,
  projectName: '',
  title: '',
});

/**
 * 管理两个互不影响的新增草稿及其开关；关闭和空标题取消不会清空字段，只有成功创建才重置。
 */
export function useTaskCreateDrafts() {
  const [timedOpen, setTimedOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [timedDraft, setTimedDraft] = useState<TimedTaskCreateDraft>(
    initialTimedDraft('work'),
  );
  const [quickDraft, setQuickDraft] = useState<QuickTaskCreateDraft>(
    initialQuickDraft('other'),
  );

  const updateTimedDraft = (patch: Partial<TimedTaskCreateDraft>) =>
    setTimedDraft((current) => ({ ...current, ...patch }));
  const updateQuickDraft = (patch: Partial<QuickTaskCreateDraft>) =>
    setQuickDraft((current) => ({ ...current, ...patch }));
  const openTimed = (projectId: string) => {
    updateTimedDraft({ projectId });
    setTimedOpen(true);
  };
  const openQuick = (projectId: string) => {
    updateQuickDraft({ projectId });
    setQuickOpen(true);
  };

  return {
    closeQuick: () => setQuickOpen(false),
    closeTimed: () => setTimedOpen(false),
    openQuick,
    openTimed,
    quickDraft,
    quickOpen,
    resetQuick: (projectId: string) => setQuickDraft(initialQuickDraft(projectId)),
    resetTimed: (projectId: string) => setTimedDraft(initialTimedDraft(projectId)),
    timedDraft,
    timedOpen,
    updateQuickDraft,
    updateTimedDraft,
  };
}
