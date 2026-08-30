/**
 * @fileoverview 今日日程列表呈现：桌面保留表头网格，手机隐藏表头走纵向任务行。
 */

import type { ReactNode } from 'react';

/**
 * 桌面日程：渲染列标题与任务行滚动容器。手机端表头由 CSS 隐藏，行改为卡片信息架构。
 */
export function DesktopScheduleList({ children }: { children: ReactNode }) {
  return (
    <div className="timeline-scroll">
      <div className="timeline-head">
        <span className="timeline-col-time">时间</span>
        <span className="timeline-col-check"></span>
        <span className="timeline-col-project">项目</span>
        <span className="timeline-col-title">任务</span>
        <span className="timeline-col-planned">预计</span>
        <span className="timeline-col-actual">实际</span>
        <span className="timeline-col-actions">操作</span>
      </div>
      {children}
    </div>
  );
}

/**
 * 手机日程列表容器。与桌面共用任务行组件和业务回调，不复制工作流。
 */
export function MobileScheduleList({ children }: { children: ReactNode }) {
  return <div className="timeline-scroll timeline-scroll--mobile">{children}</div>;
}
