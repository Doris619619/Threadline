/** @fileoverview 提供本地工作区与键值存储仓储，并隔离 Preview 演示数据。 */
import { workspaceStorageKey } from '@/lib/workspace-runtime';
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

export interface PersistentStateRepository {
  read<T>(key: string): Promise<T | undefined>;
  write<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
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

export class LocalStorageStateRepository implements PersistentStateRepository {
  /** 读取当前运行模式的键；无效 JSON 只清理该命名空间下的记录。 */
  async read<T>(key: string): Promise<T | undefined> {
    key = workspaceStorageKey(key);
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      window.localStorage.removeItem(key);
      return undefined;
    }
  }

  /** 演示数据只写入演示命名空间，不覆盖旧本地记录。 */
  async write<T>(key: string, value: T) {
    window.localStorage.setItem(workspaceStorageKey(key), JSON.stringify(value));
  }

  /** 只删除当前运行模式下指定的键。 */
  async remove(key: string) {
    window.localStorage.removeItem(workspaceStorageKey(key));
  }
}

class MemoryStateRepository implements PersistentStateRepository {
  private readonly values = new Map<string, unknown>();

  async read<T>(key: string): Promise<T | undefined> {
    const value = this.values.get(key);
    return value === undefined ? undefined : structuredClone(value as T);
  }

  async write<T>(key: string, value: T) {
    this.values.set(key, structuredClone(value));
  }

  async remove(key: string) {
    this.values.delete(key);
  }
}

export function createPersistentStateRepository(): PersistentStateRepository {
  return typeof window === 'undefined'
    ? new MemoryStateRepository()
    : new LocalStorageStateRepository();
}

export function createWorkspaceRepository(
  fallback: WorkspaceData,
): WorkspaceRepository {
  return typeof window === 'undefined'
    ? new MockWorkspaceRepository(fallback)
    : new LocalStorageWorkspaceRepository('threadline.workspace.v1', fallback);
}
