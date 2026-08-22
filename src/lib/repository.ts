import type {
  CloseRecord,
  DailyDefinition,
  DailyInstance,
  DailySubtask,
  DailySubtaskInstance,
  HistoryEvent,
  Project,
  Task,
} from '@/types/domain';

export type WorkspaceData = {
  projects: Project[];
  tasks: Task[];
  dailyDefinitions: DailyDefinition[];
  dailyInstances: DailyInstance[];
  dailySubtasks: DailySubtask[];
  dailySubtaskInstances: DailySubtaskInstance[];
  history: HistoryEvent[];
  closeRecords: CloseRecord[];
};
export interface WorkspaceRepository {
  read(): Promise<WorkspaceData>;
  write(data: WorkspaceData): Promise<void>;
}
export class MockWorkspaceRepository implements WorkspaceRepository {
  constructor(private data: WorkspaceData) {}
  async read() {
    return structuredClone(this.data);
  }
  async write(data: WorkspaceData) {
    this.data = structuredClone(data);
  }
}
