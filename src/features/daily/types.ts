/**
 * @fileoverview 定义 Daily 领域数据，供面板、工作区和派生数据共享，而不依赖 UI 模块。
 */

/** Daily 模板或指定日期实例的可持久化字段。 */
export type Daily = {
  /** 数据库日期实例 UUID；UI 的 id 继续表示长期 template identity。 */
  entryId?: string;
  id: string;
  /** 仅兼容已生成的旧 entry snapshot；新模板与管理 UI 不得依赖。 */
  projectId?: string;
  /** 仅兼容旧 Daily entry 展示快照。 */
  project?: string;
  /** 仅兼容旧 Daily entry 展示快照。 */
  color?: string;
  title: string;
  actual: number;
  result: string;
  completed: boolean;
  /** 模板生命周期；每日 entry 始终按当天 snapshot 展示。 */
  active?: boolean;
  deletedAt?: string;
  children: {
    /** 当天 entry item UUID；新增子项在客户端先生成稳定 ID，历史 seed 可暂缺。 */
    id?: string;
    templateItemId?: string;
    title: string;
    /** 模板清单项的预计分钟；实例 actual 是独立的实际投入。 */
    plannedDurationMinutes?: number;
    active?: boolean;
    deletedAt?: string;
    completed: boolean;
    actual: number;
  }[];
};

/** Daily 在每日收尾时写入的历史快照字段。 */
export type DailyHistoryEntry = {
  id?: string;
  dailyId: string;
  /** 仅兼容旧 history 项目快照；analytics 不再使用。 */
  projectId?: string;
  date: string;
  completed: boolean;
  actual: number;
  result: string;
};
