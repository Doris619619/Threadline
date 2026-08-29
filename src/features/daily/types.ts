/**
 * @fileoverview 定义 Daily 领域数据，供面板、工作区和派生数据共享，而不依赖 UI 模块。
 */

/** Daily 模板或指定日期实例的可持久化字段。 */
export type Daily = {
  id: string;
  projectId: string;
  project: string;
  color: string;
  title: string;
  actual: number;
  result: string;
  completed: boolean;
  children: { title: string; completed: boolean; actual: number }[];
};

/** Daily 在每日收尾时写入的历史快照字段。 */
export type DailyHistoryEntry = {
  dailyId: string;
  projectId: string;
  date: string;
  completed: boolean;
  actual: number;
  result: string;
};
