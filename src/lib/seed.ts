import type { WorkspaceData } from '@/lib/repository';
import { getLocalDateKey } from '@/lib/local-date';

/** 为首次本地初始化创建与用户当天一致的空工作区，不复用演示用固定日期。 */
export function createSeedWorkspace(now = new Date()): WorkspaceData {
  const createdAt = `${getLocalDateKey(now)}T00:00:00`;
  return {
    projects: [
      { id: 'other', name: '其他', color: '#8793a7', status: 'active', createdAt },
      {
        id: 'research',
        name: '科研',
        color: '#2f80ed',
        status: 'active',
        createdAt,
      },
    ],
    tasks: [],
    dailyDefinitions: [],
    dailyInstances: [],
    dailySubtasks: [],
    dailySubtaskInstances: [],
    history: [],
    closeRecords: [],
  };
}

/** 为现有 repository 调用保留默认 fallback，但每次模块初始化都使用当前本地日期。 */
export const seedWorkspace = createSeedWorkspace();
