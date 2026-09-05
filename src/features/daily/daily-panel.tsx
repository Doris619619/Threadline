/** @fileoverview 首页以项目页的内嵌清单风格展示 Daily，完成和耗时自动保存，不设记录表单。 */

'use client';

import { Surface } from '@/components/ui/surface';
import { DailyExecutionRow } from '@/features/daily/daily-execution-row';
import type { Daily } from '@/features/daily/types';

export type { Daily, DailyHistoryEntry } from '@/features/daily/types';

/** 每个日期实例独立管理输入和保存状态，切换日期不会串用上一天草稿。 */
export function DailyPanel({
  items,
  date,
  onSave,
}: {
  items: Daily[];
  date: string;
  onSave: (daily: Daily, date: string) => Promise<void>;
}) {
  return (
    <Surface className="daily-panel">
      <header>
        <h2>Daily 任务</h2>
      </header>
      {items.length === 0 && <p className="empty-copy">暂无 Daily，可在项目页添加</p>}
      {items.map((daily) => (
        <DailyExecutionRow
          key={date + ':' + daily.id}
          daily={daily}
          date={date}
          onSave={onSave}
        />
      ))}
    </Surface>
  );
}
