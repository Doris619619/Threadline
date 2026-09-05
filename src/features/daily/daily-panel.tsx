/** @fileoverview 首页完整展示 Daily 父子任务、预计/实际耗时和结果，不使用折叠或详情页。 */

'use client';

import { Surface } from '@/components/ui/surface';
import { DailyExecutionRow } from '@/features/daily/daily-execution-row';
import type { Daily, DailyHistoryEntry } from '@/features/daily/types';

export type { Daily, DailyHistoryEntry } from '@/features/daily/types';

/** 每个日期实例独立管理输入和保存状态，切换日期不会串用上一天草稿。 */
export function DailyPanel({
  items,
  history,
  date,
  onSave,
  onRecord,
}: {
  items: Daily[];
  history: DailyHistoryEntry[];
  date: string;
  onSave: (daily: Daily, date: string) => Promise<void>;
  onRecord: (entry: DailyHistoryEntry) => Promise<void>;
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
          recorded={history.some(
            (entry) => entry.dailyId === daily.id && entry.date === date,
          )}
          onSave={onSave}
          onRecord={onRecord}
        />
      ))}
    </Surface>
  );
}
