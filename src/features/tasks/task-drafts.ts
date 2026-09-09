/**
 * @fileoverview 定义任务创建草稿，避免动作层从展示组件导入类型。
 */

/** 完整工作台日程新增行提交给动作层的字段。 */
export type TimedTaskDraft = {
  actual: string;
  completed: boolean;
  endTime: string;
  planned: string;
  projectId: string;
  startTime: string;
  title: string;
};

/** 完整工作台无日期待安排新增行提交给动作层的字段。 */
export type QuickTaskDraft = {
  planned?: string;
  /** 分组添加入口指定重要性；旧调用默认普通。 */
  importance?: 'important' | 'normal';
  projectId: string;
  title: string;
};
