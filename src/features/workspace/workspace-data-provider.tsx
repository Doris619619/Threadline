/** @fileoverview 按领域组合本地持久化状态与动作，避免把 TaskDashboard 的职责转移成单一全局对象。 */

'use client';

import {
  createContext,
  useContext,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  type Daily,
  seedDaily,
  type DailyHistoryEntry,
} from '@/features/daily/daily-panel';
import {
  createInitialTasks,
  createProjectSeed,
  withoutExpiredTasks,
} from '@/features/workspace/workspace-seed';
import { useAnnotationStrokes } from '@/hooks/use-annotation-strokes';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { getLocalDateKey } from '@/lib/local-date';
import type {
  AnnotationStroke,
  CloseRecord,
  HistoryEvent,
  Project,
  Task,
} from '@/types/domain';

type TaskState = { tasks: Task[] };
type TaskActions = { updateTasks: Dispatch<SetStateAction<Task[]>> };
type ProjectState = { projects: Project[] };
type ProjectActions = { updateProjects: Dispatch<SetStateAction<Project[]>> };
type DailyState = {
  dailyByDate: Record<string, Daily[]>;
  dailyTemplates: Daily[];
  dailyHistory: DailyHistoryEntry[];
};
type DailyActions = {
  updateDailyByDate: Dispatch<SetStateAction<Record<string, Daily[]>>>;
  updateDailyTemplates: Dispatch<SetStateAction<Daily[]>>;
  updateDailyHistory: Dispatch<SetStateAction<DailyHistoryEntry[]>>;
};
type HistoryState = { history: HistoryEvent[]; closeRecords: CloseRecord[] };
type HistoryActions = {
  updateHistory: Dispatch<SetStateAction<HistoryEvent[]>>;
  updateCloseRecords: Dispatch<SetStateAction<CloseRecord[]>>;
};
type WorkspaceSurfaceState = {
  annotationStrokes: AnnotationStroke[];
  workstationTaskIds: string[];
  highlightColor: string;
};
type WorkspaceSurfaceActions = {
  updateAnnotationStrokes: Dispatch<SetStateAction<AnnotationStroke[]>>;
  updateWorkstationTaskIds: Dispatch<SetStateAction<string[]>>;
  updateHighlightColor: Dispatch<SetStateAction<string>>;
};

const TaskStateContext = createContext<TaskState | null>(null);
const TaskActionsContext = createContext<TaskActions | null>(null);
const ProjectStateContext = createContext<ProjectState | null>(null);
const ProjectActionsContext = createContext<ProjectActions | null>(null);
const DailyStateContext = createContext<DailyState | null>(null);
const DailyActionsContext = createContext<DailyActions | null>(null);
const HistoryStateContext = createContext<HistoryState | null>(null);
const HistoryActionsContext = createContext<HistoryActions | null>(null);
const WorkspaceSurfaceStateContext = createContext<WorkspaceSurfaceState | null>(null);
const WorkspaceSurfaceActionsContext = createContext<WorkspaceSurfaceActions | null>(
  null,
);
const WorkspaceHydrationContext = createContext(false);

/** 读取必需领域 Context；在 Provider 外调用时立即失败，避免静默退化为另一份状态。 */
function useRequiredContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) throw new Error(`${name} must be used inside WorkspaceDataProvider.`);
  return value;
}

/** 将各领域 storage hydration 协调为单一就绪信号，不在这里写入业务规则或 analytics。 */
export function WorkspaceDataProvider({ children }: { children: ReactNode }) {
  const [tasks, updateTasks, tasksHydrated] = usePersistentState(
    'threadline.tasks.v1',
    () => withoutExpiredTasks(createInitialTasks()),
    withoutExpiredTasks,
  );
  const [projects, updateProjects, projectsHydrated] = usePersistentState(
    'threadline.projects.v1',
    createProjectSeed,
  );
  const [dailyByDate, updateDailyByDate, dailyByDateHydrated] = usePersistentState<
    Record<string, Daily[]>
  >('threadline.daily-by-date.v1', () => ({ [getLocalDateKey()]: seedDaily }));
  const [dailyTemplates, updateDailyTemplates, dailyTemplatesHydrated] =
    usePersistentState<Daily[]>('threadline.daily-templates.v1', seedDaily);
  const [dailyHistory, updateDailyHistory, dailyHistoryHydrated] = usePersistentState<
    DailyHistoryEntry[]
  >('threadline.daily-history.v1', []);
  const [history, updateHistory, historyHydrated] = usePersistentState<HistoryEvent[]>(
    'threadline.history.v1',
    [],
  );
  const [closeRecords, updateCloseRecords, closeRecordsHydrated] = usePersistentState<
    CloseRecord[]
  >('threadline.close-records.v1', []);
  const [annotationStrokes, updateAnnotationStrokes, annotationHydrated] =
    useAnnotationStrokes();
  const [workstationTaskIds, updateWorkstationTaskIds, workstationHydrated] =
    usePersistentState<string[]>('threadline.workstation.v1', [], (value) =>
      Array.isArray(value)
        ? [...new Set(value.filter((id) => typeof id === 'string'))]
        : [],
    );
  const [highlightColor, updateHighlightColor, highlightHydrated] =
    usePersistentState<string>(
      'threadline.annotation-highlight-color.v1',
      'rgba(255, 225, 53, 0.42)',
    );

  const hydrated =
    tasksHydrated &&
    projectsHydrated &&
    dailyByDateHydrated &&
    dailyTemplatesHydrated &&
    dailyHistoryHydrated &&
    historyHydrated &&
    closeRecordsHydrated &&
    annotationHydrated &&
    workstationHydrated &&
    highlightHydrated;
  const taskState = useMemo(() => ({ tasks }), [tasks]);
  const projectState = useMemo(() => ({ projects }), [projects]);
  const dailyState = useMemo(
    () => ({ dailyByDate, dailyTemplates, dailyHistory }),
    [dailyByDate, dailyTemplates, dailyHistory],
  );
  const historyState = useMemo(
    () => ({ history, closeRecords }),
    [history, closeRecords],
  );
  const surfaceState = useMemo(
    () => ({ annotationStrokes, workstationTaskIds, highlightColor }),
    [annotationStrokes, workstationTaskIds, highlightColor],
  );
  const taskActions = useMemo(() => ({ updateTasks }), [updateTasks]);
  const projectActions = useMemo(() => ({ updateProjects }), [updateProjects]);
  const dailyActions = useMemo(
    () => ({ updateDailyByDate, updateDailyTemplates, updateDailyHistory }),
    [updateDailyByDate, updateDailyTemplates, updateDailyHistory],
  );
  const historyActions = useMemo(
    () => ({ updateHistory, updateCloseRecords }),
    [updateHistory, updateCloseRecords],
  );
  const surfaceActions = useMemo(
    () => ({ updateAnnotationStrokes, updateWorkstationTaskIds, updateHighlightColor }),
    [updateAnnotationStrokes, updateWorkstationTaskIds, updateHighlightColor],
  );
  return (
    <WorkspaceHydrationContext.Provider value={hydrated}>
      <TaskStateContext.Provider value={taskState}>
        <TaskActionsContext.Provider value={taskActions}>
          <ProjectStateContext.Provider value={projectState}>
            <ProjectActionsContext.Provider value={projectActions}>
              <DailyStateContext.Provider value={dailyState}>
                <DailyActionsContext.Provider value={dailyActions}>
                  <HistoryStateContext.Provider value={historyState}>
                    <HistoryActionsContext.Provider value={historyActions}>
                      <WorkspaceSurfaceStateContext.Provider value={surfaceState}>
                        <WorkspaceSurfaceActionsContext.Provider value={surfaceActions}>
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
    </WorkspaceHydrationContext.Provider>
  );
}

/** 组合当前页面所需领域读取与动作；组件仍可按单独 Context 订阅，避免全局对象广播。 */
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
    hydrated: useContext(WorkspaceHydrationContext),
  };
}
