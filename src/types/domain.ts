export type Id = string;
export type TaskStatus = 'active' | 'rescheduled' | 'backlog' | 'abandoned' | 'trashed';
export type ProjectStatus = 'active' | 'archived';
export type Project = {
  id: Id;
  name: string;
  color: string;
  status: ProjectStatus;
  createdAt: string;
  archivedAt?: string;
};
export type Task = {
  id: Id;
  projectId: Id;
  title: string;
  date?: string;
  plannedStartTime?: string;
  plannedEndTime?: string;
  plannedDurationMinutes?: number;
  actualDurationMinutes?: number;
  completed: boolean;
  completedAt?: string;
  status: TaskStatus;
  backlogImportance?: 'important' | 'not_important';
  ddlAt?: string;
  postponedFrom?: string;
  postponedTo?: string;
  abandonedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};
export type DailyDefinition = {
  id: Id;
  projectId: Id;
  title: string;
  active: boolean;
  createdAt: string;
};
export type DailyInstance = {
  id: Id;
  definitionId: Id;
  date: string;
  completed: boolean;
  actualDurationMinutes?: number;
  result?: string;
};
export type DailySubtask = {
  id: Id;
  definitionId: Id;
  title: string;
  position: number;
};
export type DailySubtaskInstance = {
  id: Id;
  instanceId: Id;
  subtaskId: Id;
  completed: boolean;
};
export type HistoryEvent = {
  id: Id;
  taskId?: Id;
  dailyInstanceId?: Id;
  type: string;
  occurredAt: string;
  payload?: Record<string, string>;
};
export type CloseRecord = {
  id: Id;
  date: string;
  closedAt: string;
  projectMinutes: Record<Id, number>;
};
