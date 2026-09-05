/** @fileoverview 首页以项目页的内嵌清单风格展示 Daily，完成和耗时自动保存，不设记录表单。 */

'use client';

import { useImperativeHandle, useRef, type Ref } from 'react';
import { Surface } from '@/components/ui/surface';
import {
  DailyExecutionRow,
  type DailyExecutionHandle,
} from '@/features/daily/daily-execution-row';
import type { Daily } from '@/features/daily/types';

export type { Daily, DailyHistoryEntry } from '@/features/daily/types';

/** 向收尾入口提供整组保存屏障，不暴露可变 Daily 草稿。 */
export type DailyPanelHandle = { flush: () => Promise<void> };

/** 每个日期实例独立管理输入和保存状态，切换日期不会串用上一天草稿。 */
export function DailyPanel({
  ref,
  items,
  date,
  onSave,
}: {
  ref?: Ref<DailyPanelHandle>;
  items: Daily[];
  date: string;
  onSave: (daily: Daily, date: string) => Promise<void>;
}) {
  const rows = useRef(new Map<string, DailyExecutionHandle>());
  useImperativeHandle(ref, () => ({
    /** 所有行均尝试保存；任意失败时拒绝收尾，各行保留自己的错误和草稿。 */
    async flush() {
      const results = await Promise.allSettled(
        [...rows.current.values()].map((row) => row.flush()),
      );
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    },
  }));
  return (
    <Surface className="daily-panel">
      <header>
        <h2>Daily 任务</h2>
      </header>
      {items.length === 0 && <p className="empty-copy">暂无 Daily，可在项目页添加</p>}
      {items.map((daily) => (
        <DailyExecutionRow
          key={date + ':' + daily.id}
          ref={(row) => {
            const key = date + ':' + daily.id;
            if (row) rows.current.set(key, row);
            else rows.current.delete(key);
          }}
          daily={daily}
          date={date}
          onSave={onSave}
        />
      ))}
    </Surface>
  );
}
