/**
 * @fileoverview 定义 Daily 领域数据，供面板、工作区和派生数据共享，而不依赖 UI 模块。
 */

/** Daily 模板或指定日期实例的可持久化字段。 */
export type Daily = {
  /** 数据库日期实例 UUID；UI 的 id 继续表示长期 template identity。 */
  entryId?: string;
  id: string;
  projectId: string;
  project: string;
  color: string;
  title: string;
  actual: number;
  result: string;
  completed: boolean;
  children: {
    /** 当天 entry item UUID；模板预览或尚未持久化的新增项可以暂缺。 */
    id?: string;
    templateItemId?: string;
    title: string;
    completed: boolean;
    actual: number;
  }[];
};

/** Daily 在每日收尾时写入的历史快照字段。 */
export type DailyHistoryEntry = {
  id?: string;
  dailyId: string;
  projectId: string;
  date: string;
  completed: boolean;
  actual: number;
  result: string;
};
