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

export class LocalStorageWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private readonly key: string,
    private readonly fallback: WorkspaceData,
  ) {}

  async read() {
    const raw = window.localStorage.getItem(this.key);
    if (!raw) return structuredClone(this.fallback);
    try {
      return JSON.parse(raw) as WorkspaceData;
    } catch {
      window.localStorage.removeItem(this.key);
      return structuredClone(this.fallback);
    }
  }

  async write(data: WorkspaceData) {
    window.localStorage.setItem(this.key, JSON.stringify(data));
  }
}

export function createWorkspaceRepository(
  fallback: WorkspaceData,
): WorkspaceRepository {
  return typeof window === 'undefined'
    ? new MockWorkspaceRepository(fallback)
    : new LocalStorageWorkspaceRepository('threadline.workspace.v1', fallback);
}
