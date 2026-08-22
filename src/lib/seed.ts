import type { WorkspaceData } from '@/lib/repository';

const now = '2026-08-23T08:00:00.000Z';
export const seedWorkspace: WorkspaceData = {
  projects: [
    { id: 'other', name: '其他', color: '#8793a7', status: 'active', createdAt: now },
    {
      id: 'research',
      name: '科研',
      color: '#2f80ed',
      status: 'active',
      createdAt: now,
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
