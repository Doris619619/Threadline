/**
 * @fileoverview 领域模型定义，包含任务、项目、Daily 模板与实例、荧光笔笔迹数据结构。
 */

export type Id = string;
export type TaskStatus = 'active' | 'waiting' | 'abandoned' | 'trashed';
export type ProjectStatus = 'active' | 'archived';
/** 日期范围代表计划周期；是否已结束按账号自然日派生，永不自动删除。 */
export type StagePlan = {
  id: Id;
  name: string;
  startDate: string;
  endDate: string;
  homeVisible: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};
export type Project = {
  id: Id;
  name: string;
  color: string;
  status: ProjectStatus;
  position?: number;
  isFallback?: boolean;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string;
  deletedAt?: string;
};
export type Task = {
  id: Id;
  projectId: Id;
  /** 独立于项目的阶段归属；安排和完成只改变任务状态，不移除关联。 */
  stagePlanId?: Id;
  title: string;
  date?: string;
  /** 已进入某个业务日但尚未填写开始时间，仅表示待填时间 UI 状态。 */
  schedulePendingTime?: boolean;
  plannedStartTime?: string;
  plannedEndTime?: string;
  plannedDurationMinutes?: number;
  actualDurationMinutes?: number;
  completed: boolean;
  completedAt?: string;
  status: TaskStatus;
  /** 所有任务均持久化的重要性；待安排池以此字段分组，新任务默认普通。 */
  importance: 'important' | 'normal';
  postponedFrom?: string;
  postponedTo?: string;
  abandonedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};
/** 不随任务移期漂移的按日实际投入；task 清理后保留记录并移除 taskId。 */
export type TaskTimeEntry = {
  id: Id;
  taskId?: Id;
  projectId: Id;
  date: string;
  minutes: number;
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

export type AnnotationPoint = {
  x: number; // 相对宿主容器宽度的比例 0 ~ 1
  y: number; // 相对宿主容器高度的比例 0 ~ 1
};

type AnnotationStrokeBase = {
  id: Id;
  points: AnnotationPoint[];
  color: string;
  strokeWidth: number; // 相对笔刷基准像素
  createdAt: string;
  targetTaskId?: Id; // 关联的任务ID（可选）
};

/** 日期笔迹只能显示在明确的本地业务日；targetTaskId 保留为未来任务级批注的领域关联。 */
export type DateAnnotationStroke = AnnotationStrokeBase & {
  targetScope: 'date';
  targetDate: string;
};

/** 全局笔迹不绑定某一天，但仍可选择性关联任务。 */
export type GlobalAnnotationStroke = AnnotationStrokeBase & {
  targetScope: 'global';
};

export type AnnotationStroke = DateAnnotationStroke | GlobalAnnotationStroke;
