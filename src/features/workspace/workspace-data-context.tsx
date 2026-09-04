/** @fileoverview 定义云端与显式测试适配器共用的 Workspace Context 契约和组合树。 */

'use client';

import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { Daily, DailyHistoryEntry } from '@/features/daily/types';
import type {
  AnnotationStroke,
  CloseRecord,
  HistoryEvent,
  Project,
  Task,
  TaskTimeEntry,
} from '@/types/domain';

export type TaskTransition =
  'scheduled' | 'rescheduled' | 'waiting' | 'abandoned' | 'trashed';
export type CloseAction = {
  taskId: string;
  action: 'tomorrow' | 'date' | 'waiting' | 'abandoned';
  targetDate?: string;
};
export type WorkspaceCommands = {
  createProject: (project: Project) => Promise<Project>;
  updateProject: (projectId: string, name: string, color: string) => Promise<void>;
  setProjectArchived: (projectId: string, archived: boolean) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  createTask: (task: Task) => Promise<Task>;
  createDailyTemplate: (daily: Daily) => Promise<void>;
  saveDailyTemplate: (daily: Daily) => Promise<void>;
  setDailyTemplateStatus: (
    templateId: string,
    status: 'archive' | 'restore' | 'delete',
  ) => Promise<void>;
  setDailyTemplateItemStatus: (
    itemId: string,
    status: 'archive' | 'restore' | 'delete',
  ) => Promise<void>;
  transitionTask: (
    taskId: string,
    transition: TaskTransition,
    targetDate?: string,
  ) => Promise<Task>;
  /** 原子完成待安排任务，并将完成归属到调用端传入的本地业务日。 */
  completeWaitingTask: (taskId: string, completedDate: string) => Promise<Task>;
  recordDaily: (
    templateId: string,
    date: string,
    source?: 'manual' | 'close_day',
  ) => Promise<void>;
  closeDay: (
    date: string,
    actions: CloseAction[],
    projectMinutes: Record<string, number>,
  ) => Promise<void>;
};

export type WorkspaceContextValues = {
  hydrated: boolean;
  taskState: {
    tasks: Task[];
    taskTimeEntries: TaskTimeEntry[];
    /** 云端 ledger 即使为空也是实际耗时真源；显式测试适配器可声明 aggregate fallback。 */
    taskTimeEntriesAuthoritative: boolean;
  };
  taskActions: { updateTasks: Dispatch<SetStateAction<Task[]>> };
  projectState: { projects: Project[] };
  projectActions: { updateProjects: Dispatch<SetStateAction<Project[]>> };
  dailyState: {
    dailyByDate: Record<string, Daily[]>;
    dailyTemplates: Daily[];
    dailyHistory: DailyHistoryEntry[];
  };
  dailyActions: {
    updateDailyByDate: Dispatch<SetStateAction<Record<string, Daily[]>>>;
    updateDailyTemplates: Dispatch<SetStateAction<Daily[]>>;
    updateDailyHistory: Dispatch<SetStateAction<DailyHistoryEntry[]>>;
  };
  historyState: { history: HistoryEvent[]; closeRecords: CloseRecord[] };
  historyActions: {
    updateHistory: Dispatch<SetStateAction<HistoryEvent[]>>;
    updateCloseRecords: Dispatch<SetStateAction<CloseRecord[]>>;
  };
  surfaceState: {
    annotationStrokes: AnnotationStroke[];
    workstationTaskIds: string[];
    highlightColor: string;
  };
  surfaceActions: {
    updateAnnotationStrokes: Dispatch<SetStateAction<AnnotationStroke[]>>;
    updateWorkstationTaskIds: Dispatch<SetStateAction<string[]>>;
    updateHighlightColor: Dispatch<SetStateAction<string>>;
  };
  commands: WorkspaceCommands;
};

const TaskStateContext = createContext<WorkspaceContextValues['taskState'] | null>(
  null,
);
const TaskActionsContext = createContext<WorkspaceContextValues['taskActions'] | null>(
  null,
);
const ProjectStateContext = createContext<
  WorkspaceContextValues['projectState'] | null
>(null);
const ProjectActionsContext = createContext<
  WorkspaceContextValues['projectActions'] | null
>(null);
const DailyStateContext = createContext<WorkspaceContextValues['dailyState'] | null>(
  null,
);
const DailyActionsContext = createContext<
  WorkspaceContextValues['dailyActions'] | null
>(null);
const HistoryStateContext = createContext<
  WorkspaceContextValues['historyState'] | null
>(null);
const HistoryActionsContext = createContext<
  WorkspaceContextValues['historyActions'] | null
>(null);
const WorkspaceSurfaceStateContext = createContext<
  WorkspaceContextValues['surfaceState'] | null
>(null);
const WorkspaceSurfaceActionsContext = createContext<
  WorkspaceContextValues['surfaceActions'] | null
>(null);
const WorkspaceCommandsContext = createContext<WorkspaceCommands | null>(null);
const WorkspaceHydrationContext = createContext(false);

/** 读取必需领域 Context；在 Provider 外调用时立即失败，避免静默退化。 */
function useRequiredContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) throw new Error(`${name} must be used inside WorkspaceDataProvider.`);
  return value;
}

/** 按稳定职责拆分 Context，云端与测试适配器只负责提供值。 */
export function WorkspaceContextProviders({
  children,
  notice,
  values,
}: {
  children: ReactNode;
  notice?: ReactNode;
  values: WorkspaceContextValues;
}) {
  return (
    <WorkspaceHydrationContext.Provider value={values.hydrated}>
      <WorkspaceCommandsContext.Provider value={values.commands}>
        <TaskStateContext.Provider value={values.taskState}>
          <TaskActionsContext.Provider value={values.taskActions}>
            <ProjectStateContext.Provider value={values.projectState}>
              <ProjectActionsContext.Provider value={values.projectActions}>
                <DailyStateContext.Provider value={values.dailyState}>
                  <DailyActionsContext.Provider value={values.dailyActions}>
                    <HistoryStateContext.Provider value={values.historyState}>
                      <HistoryActionsContext.Provider value={values.historyActions}>
                        <WorkspaceSurfaceStateContext.Provider
                          value={values.surfaceState}
                        >
                          <WorkspaceSurfaceActionsContext.Provider
                            value={values.surfaceActions}
                          >
                            {notice}
                            {children}
                          </WorkspaceSurfaceActionsContext.Provider>
                        </WorkspaceSurfaceStateContext.Provider>
                      </HistoryActionsContext.Provider>
                    </HistoryStateContext.Provider>
                  </DailyActionsContext.Provider>
                </DailyStateContext.Provider>
              </ProjectActionsContext.Provider>
            </ProjectStateContext.Provider>
          </TaskActionsContext.Provider>
        </TaskStateContext.Provider>
      </WorkspaceCommandsContext.Provider>
    </WorkspaceHydrationContext.Provider>
  );
}

/** 组合当前页面所需领域读取、细粒度写入和原子命令。 */
export function useWorkspaceData() {
  return {
    ...useRequiredContext(TaskStateContext, 'TaskStateContext'),
    ...useRequiredContext(TaskActionsContext, 'TaskActionsContext'),
    ...useRequiredContext(ProjectStateContext, 'ProjectStateContext'),
    ...useRequiredContext(ProjectActionsContext, 'ProjectActionsContext'),
    ...useRequiredContext(DailyStateContext, 'DailyStateContext'),
    ...useRequiredContext(DailyActionsContext, 'DailyActionsContext'),
    ...useRequiredContext(HistoryStateContext, 'HistoryStateContext'),
    ...useRequiredContext(HistoryActionsContext, 'HistoryActionsContext'),
    ...useRequiredContext(WorkspaceSurfaceStateContext, 'WorkspaceSurfaceStateContext'),
    ...useRequiredContext(
      WorkspaceSurfaceActionsContext,
      'WorkspaceSurfaceActionsContext',
    ),
    ...useRequiredContext(WorkspaceCommandsContext, 'WorkspaceCommandsContext'),
    hydrated: useContext(WorkspaceHydrationContext),
  };
}
